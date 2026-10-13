import { db } from "@workspace/db";
import { charitiesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

interface CatalogEntry {
  name: string;
  description: string;
  category: "recommended" | "general" | "hated";
  cause: string;
  website?: string;
  isHot?: boolean;
  legacyNames?: string[]; // earlier names of the same row, renamed in place to keep donation history
}

// Featured partners (Recommended) + a broad catalog of well-known charities users can favorite.
const CATALOG: CatalogEntry[] = [
  // Recommended (featured partners)
  { name: "World Wildlife Fund", description: "Protects wildlife and the habitats they depend on.", category: "recommended", cause: "Environment", website: "https://www.worldwildlife.org", isHot: true, legacyNames: ["WWF"] },
  { name: "UNICEF USA", description: "Helps children in over 190 countries with health, nutrition and education.", category: "recommended", cause: "Children", website: "https://www.unicefusa.org", isHot: true, legacyNames: ["UNICEF"] },
  { name: "American Red Cross", description: "Disaster relief, blood donations and emergency support.", category: "recommended", cause: "Disaster relief", website: "https://www.redcross.org", legacyNames: ["Красный Крест"] },
  { name: "Doctors Without Borders", description: "Emergency medical care in conflict zones and crises.", category: "recommended", cause: "Health", website: "https://www.doctorswithoutborders.org", legacyNames: ["Врачи без границ"] },
  { name: "Save the Children", description: "Gives children a healthy start, education and protection.", category: "recommended", cause: "Children", website: "https://www.savethechildren.org" },

  // Catalog
  { name: "St. Jude Children's Research Hospital", description: "Treats and researches childhood cancer; families never pay for care.", category: "general", cause: "Health", website: "https://www.stjude.org" },
  { name: "Partners In Health", description: "Brings high-quality health care to the world's poorest communities.", category: "general", cause: "Health", website: "https://www.pih.org" },
  { name: "Against Malaria Foundation", description: "Funds bed nets that protect families from malaria.", category: "general", cause: "Health", website: "https://www.againstmalaria.com" },
  { name: "Helen Keller Intl", description: "Prevents blindness and malnutrition with proven, low-cost programs.", category: "general", cause: "Health", website: "https://helenkellerintl.org" },
  { name: "American Cancer Society", description: "Funds cancer research and supports patients and families.", category: "general", cause: "Health", website: "https://www.cancer.org" },
  { name: "Direct Relief", description: "Delivers medicine and supplies to health workers worldwide.", category: "general", cause: "Health", website: "https://www.directrelief.org" },
  { name: "NAMI", description: "National Alliance on Mental Illness: support, education and advocacy.", category: "general", cause: "Mental health", website: "https://www.nami.org" },
  { name: "Feeding America", description: "Nationwide network of food banks fighting hunger in the US.", category: "general", cause: "Hunger", website: "https://www.feedingamerica.org" },
  { name: "World Central Kitchen", description: "Serves fresh meals on the front lines of disasters.", category: "general", cause: "Hunger", website: "https://wck.org" },
  { name: "GiveDirectly", description: "Sends cash directly to people living in extreme poverty.", category: "general", cause: "Poverty", website: "https://www.givedirectly.org" },
  { name: "Oxfam America", description: "Fights poverty and inequality around the world.", category: "general", cause: "Poverty", website: "https://www.oxfamamerica.org" },
  { name: "CARE", description: "Fights global poverty with a focus on women and girls.", category: "general", cause: "Poverty", website: "https://www.care.org" },
  { name: "Habitat for Humanity", description: "Builds and repairs affordable homes with families in need.", category: "general", cause: "Housing", website: "https://www.habitat.org" },
  { name: "charity: water", description: "Brings clean and safe drinking water to people in need.", category: "general", cause: "Water", website: "https://www.charitywater.org" },
  { name: "Water.org", description: "Helps families get access to safe water and sanitation.", category: "general", cause: "Water", website: "https://water.org" },
  { name: "The Nature Conservancy", description: "Conserves the lands and waters on which all life depends.", category: "general", cause: "Environment", website: "https://www.nature.org" },
  { name: "Environmental Defense Fund", description: "Tackles climate change and pollution with science-based solutions.", category: "general", cause: "Environment", website: "https://www.edf.org" },
  { name: "Ocean Conservancy", description: "Protects the ocean from today's greatest global challenges.", category: "general", cause: "Environment", website: "https://oceanconservancy.org" },
  { name: "ASPCA", description: "Prevents cruelty to animals and rescues pets in need.", category: "general", cause: "Animals", website: "https://www.aspca.org" },
  { name: "Best Friends Animal Society", description: "Works to end the killing of dogs and cats in shelters.", category: "general", cause: "Animals", website: "https://bestfriends.org" },
  { name: "Khan Academy", description: "Free, world-class education for anyone, anywhere.", category: "general", cause: "Education", website: "https://www.khanacademy.org" },
  { name: "Room to Read", description: "Child literacy and girls' education in low-income countries.", category: "general", cause: "Education", website: "https://www.roomtoread.org" },
  { name: "Wikimedia Foundation", description: "Keeps Wikipedia free and open for everyone.", category: "general", cause: "Education", website: "https://wikimediafoundation.org" },
  { name: "International Rescue Committee", description: "Helps people whose lives are shattered by conflict and disaster.", category: "general", cause: "Refugees", website: "https://www.rescue.org" },
  { name: "USA for UNHCR", description: "Supports the UN Refugee Agency's lifesaving work.", category: "general", cause: "Refugees", website: "https://www.unrefugees.org" },
  { name: "Make-A-Wish", description: "Grants wishes to children with critical illnesses.", category: "general", cause: "Children", website: "https://wish.org" },
  { name: "Team Rubicon", description: "Veterans who serve communities after disasters.", category: "general", cause: "Disaster relief", website: "https://teamrubicon.org" },

  // Hated (motivation by aversion)
  { name: "Anonymous Corp Lobby", description: "Lobbying for corporate interests.", category: "hated", cause: "Lobbying" },
  { name: "Anti-Vax Foundation", description: "Spreads anti-vaccine propaganda.", category: "hated", cause: "Misinformation" },
  { name: "Flat Earth Society", description: "Promotes pseudoscientific theories.", category: "hated", cause: "Misinformation" },
  { name: "Spam Political PAC", description: "A spammy political action committee.", category: "hated", cause: "Politics" },
  { name: "Fossil Fuel Lobby", description: "Lobbying for the oil and gas industry.", category: "hated", cause: "Lobbying" },
];

/** Inserts missing catalog charities and refreshes existing ones (matched by name or legacy name). */
export async function syncCharityCatalog() {
  for (const entry of CATALOG) {
    const names = [entry.name, ...(entry.legacyNames ?? [])];
    const [existing] = await db.select({ id: charitiesTable.id }).from(charitiesTable)
      .where(inArray(charitiesTable.name, names)).limit(1);
    const values = {
      name: entry.name,
      description: entry.description,
      category: entry.category,
      cause: entry.cause,
      website: entry.website ?? null,
      isHot: entry.isHot ?? false,
    };
    if (existing) {
      await db.update(charitiesTable).set(values).where(eq(charitiesTable.id, existing.id));
    } else {
      await db.insert(charitiesTable).values(values);
    }
  }
}
