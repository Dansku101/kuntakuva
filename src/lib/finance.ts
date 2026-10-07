const TREASURY = "https://prodkuntarest.westeurope.cloudapp.azure.com";
const DIRECTORY = "https://rajapinnat.ymparisto.fi/api/Hakemistorajapinta/1.0/odata";

export type AccountsDataset = {
  ytunnus: string; raportointikausi: string; raportointikokonaisuus: string;
  hyvaksymisvaihe: string; hyvaksymispvm: string;
};

// KKNR municipality accounts, not KTAS budgets or KKOTR group accounts.
// Reconciled against Espoo and Kauniainen's published 2024/2025 accounts.
export const accountsFields = {
  operatingRevenue: "3319283", operatingExpenses: "3418067", taxRevenue: "3460403",
  stateTransfers: "3530963", personnel: "1562", services: "699", materials: "683",
  grants: "3432179", otherExpenses: "3446291", annualResult: "159456", surplus: "1447",
  annualMargin: "1400", depreciation: "1470", investments: "1374",
} as const;
export type AccountsValues = Record<keyof typeof accountsFields, number | null>;
const verifiedTaxonomies: Record<string, string> = {
  "2024": "jhs-2018-01/2023-04-02", "2025": "jhs-2018-01/2024-03-26",
};
export type MunicipalityAccounts = {
  year: string; businessId: string; publishedAt: string; corrected: boolean;
  sourceUrl: string; values: AccountsValues;
};
type AccountsFact = {
  ytunnus: string; raportointikausi: string; raportointikokonaisuus: string;
  osakokonaisuus: string; taksonomia: string; tunnusluku: string; arvo: string | null;
};

export function expenseShares(values: AccountsValues): number[] | null {
  const parts = [values.personnel, values.services, values.materials, values.grants, values.otherExpenses];
  const total = values.operatingExpenses;
  if (total === null || !Number.isFinite(total) || total <= 0 ||
      parts.some((v) => v === null || !Number.isFinite(v) || v < 0)) return null;
  const amounts = parts as number[];
  if (Math.abs(amounts.reduce((sum, v) => sum + v, 0) - total) > 0.05) return null;
  return amounts.map((v) => v / total * 100);
}

export function perResidentAmount(amount: number | null, population: number | null) {
  return amount === null || population === null || !Number.isFinite(amount) ||
    !Number.isFinite(population) || population <= 0 ? null : amount / population;
}

export function depreciationCoverage(values: AccountsValues): number | null {
  const { annualMargin, depreciation } = values;
  return annualMargin === null || depreciation === null || !Number.isFinite(annualMargin) ||
    !Number.isFinite(depreciation) || depreciation <= 0 ? null : annualMargin / depreciation * 100;
}

export function selectAccountsDataset(datasets: AccountsDataset[], businessId: string, year: string) {
  return datasets.filter((item) => item.ytunnus === businessId && item.raportointikausi === `${year}C12` &&
    item.raportointikokonaisuus === "KKNR" && typeof item.hyvaksymispvm === "string" &&
    ["Lopullinen", "Jälkikorjattu"].includes(item.hyvaksymisvaihe))
    .sort((a, b) => b.hyvaksymispvm.localeCompare(a.hyvaksymispvm))[0] ?? null;
}

export function parseAccountsFacts(facts: AccountsFact[], businessId: string, year: string): AccountsValues {
  if (!verifiedTaxonomies[year] || !Array.isArray(facts) || !facts.length || facts.some((fact) => !fact ||
    fact.ytunnus !== businessId || fact.raportointikausi !== `${year}C12` ||
    fact.raportointikokonaisuus !== "KKNR" || fact.taksonomia !== verifiedTaxonomies[year])) {
    throw new Error("Unsupported accounts taxonomy or reporting scope.");
  }
  return Object.fromEntries(Object.entries(accountsFields).map(([name, id]) => {
    const table = name === "investments" ? "k-t13" : "k-t07";
    const matches = facts.filter((fact) => fact.osakokonaisuus === table && fact.tunnusluku === id);
    if (matches.length > 1) throw new Error(`Duplicate accounts field ${id}.`);
    const raw = matches[0]?.arvo;
    if (raw === undefined || raw === null || raw === "") return [name, null];
    if (typeof raw !== "string" || !/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) {
      throw new Error(`Invalid accounts amount ${id}.`);
    }
    return [name, Number(raw)];
  })) as AccountsValues;
}

async function getJson(url: string, large = false) {
  const response = await fetch(url, {
    ...(large ? { cache: "no-store" as const } : { cache: "force-cache" as const, next: { revalidate: 86400 } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Finance source request failed: ${response.status}.`);
  return response.json();
}

// The full catalogue exceeds Next's fetch-cache limit; retain year-end accounts in memory.
let catalog: { expires: number; pending: Promise<AccountsDataset[]> } | undefined;
function getAccountsCatalog() {
  if (!catalog || catalog.expires <= Date.now()) {
    const pending = getJson(`${TREASURY}/rest/v1/json/aineistot`, true).then((data) => {
      if (!data || !Array.isArray(data.aineistot)) throw new Error("Invalid Treasury catalogue.");
      return data.aineistot.filter((item: AccountsDataset) => item &&
        item.raportointikokonaisuus === "KKNR" && /^\d{4}C12$/.test(item.raportointikausi));
    });
    catalog = { expires: Date.now() + 3600_000, pending };
    pending.catch(() => { if (catalog?.pending === pending) catalog = undefined; });
  }
  return catalog.pending;
}

export async function getMunicipalityAccounts(code: string, year: string): Promise<MunicipalityAccounts | null> {
  if (!/^KU\d{3}$/.test(code) || !/^\d{4}$/.test(year)) throw new Error("Invalid municipality or year.");
  // Never reinterpret an unverified taxonomy or substitute forecasts for missing actuals.
  if (!verifiedTaxonomies[year]) return null;
  const id = Number(code.slice(2));
  const directory = await getJson(`${DIRECTORY}/Kunta(${id})`);
  if (directory?.Kunta_Id !== id || typeof directory.YTunnus !== "string" ||
      !/^\d{7}-\d$/.test(directory.YTunnus)) throw new Error("Municipality business ID is unavailable.");
  const businessId = directory.YTunnus;
  const dataset = selectAccountsDataset(await getAccountsCatalog(), businessId, year);
  if (!dataset) return null;
  const corrected = dataset.hyvaksymisvaihe === "Jälkikorjattu";
  const stage = corrected ? "jalkikorjattu" : "lopullinen";
  const sourceUrl = `${TREASURY}/rest/v1/json/dokumentti/${stage}/KKNR/${businessId}/${year}C12`;
  const values = parseAccountsFacts(await getJson(sourceUrl), businessId, year);
  return { year, businessId, publishedAt: dataset.hyvaksymispvm.split(" ")[0], corrected, sourceUrl, values };
}
