// Seed data for the 43 genuinely-new prospects from the Prospects agent
// upgrade spec (365 of the original 408 already existed in nexus_prospects).
// Pure data module — no filesystem reads at runtime, same convention as
// nexus-seed-data.ts.

export interface NexusBatch2Seed {
  firstName: string
  lastName: string
  jobRole: string | null
  company: string | null
  linkedinUrl: string | null
  washResult: 'Green' | 'Red' | 'Do Not Contact' | null
}

export const NEXUS_BATCH2_SEED: NexusBatch2Seed[] = [
  { firstName: "Nikiforopos", lastName: "Atsikpasis", jobRole: "Managing Director, Commodity Markets EMEA Lead", company: "Accenture", linkedinUrl: null, washResult: null },
  { firstName: "Costas", lastName: "Daroussas", jobRole: "Senior Relationship Manager", company: "Deutsche Bank", linkedinUrl: null, washResult: null },
  { firstName: "Sebestia", lastName: "Pons", jobRole: "Executive Vice President and President FMC Eurasia", company: "FMC Corporation", linkedinUrl: null, washResult: null },
  { firstName: "Jean-François", lastName: "Schultz", jobRole: "Senior Security Architect", company: "SecuLabs SA", linkedinUrl: null, washResult: null },
  { firstName: "Daniela", lastName: "Petrina", jobRole: "HR Director and Consultant", company: null, linkedinUrl: null, washResult: null },
  { firstName: "Ezgi", lastName: "Oztorum Kizmaz", jobRole: "Global Marketing Director", company: "SPD Swiss Precision Diagnostics", linkedinUrl: null, washResult: null },
  { firstName: "Beatrix", lastName: "Stevens", jobRole: "Senior Trade Policy Attache", company: null, linkedinUrl: null, washResult: null },
  { firstName: "Cesare", lastName: "Melchiori", jobRole: "Founder and CEO", company: "Blick-Up AG", linkedinUrl: null, washResult: null },
  { firstName: "Jean-François", lastName: "Van Hollebeeke", jobRole: "Global Head, Trade Legal Matters & Dispute Resolution", company: "Louis Dreyfus Company", linkedinUrl: null, washResult: null },
  { firstName: "Konstantins", lastName: "Chebotar", jobRole: "Managing Director", company: "Mercuria", linkedinUrl: null, washResult: null },
  { firstName: "Enric", lastName: "Arderiú Serra", jobRole: "Global Head of Environmental Products", company: "Mercuria", linkedinUrl: null, washResult: null },
  { firstName: "Manuela", lastName: "Lotze", jobRole: "Psychological Counsellor / Founder", company: "MOVING LIVES", linkedinUrl: null, washResult: null },
  { firstName: "Paul", lastName: "Jeremiaes", jobRole: "Adjunct Professor", company: "IFM Business School", linkedinUrl: null, washResult: null },
  { firstName: "Lea", lastName: "Vuillerodon", jobRole: "Senior Legal Counsel Global R&D", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Kelly", lastName: "Jaquet", jobRole: "Design & Technology Technician", company: "International School of Lausanne", linkedinUrl: null, washResult: null },
  { firstName: "Andrew", lastName: "Black", jobRole: "Head of Convention Secretariat", company: null, linkedinUrl: null, washResult: null },
  { firstName: "Yves", lastName: "Soriano", jobRole: "IT Support & Conference Technology Specialist", company: "CICG", linkedinUrl: null, washResult: null },
  { firstName: "Adam", lastName: "C.", jobRole: "Founder", company: null, linkedinUrl: null, washResult: null },
  { firstName: "Vicki", lastName: "Suryana", jobRole: "Internal Audit Manager", company: "Philip Morris International", linkedinUrl: null, washResult: null },
  { firstName: "Sebastian", lastName: "Grove", jobRole: "Global Head of Events", company: "DAZN", linkedinUrl: null, washResult: null },
  { firstName: "Hana", lastName: "Milanov", jobRole: "Professor of Entrepreneurship and Strategy", company: "IMD", linkedinUrl: null, washResult: null },
  { firstName: "Davide", lastName: "M.", jobRole: "Senior Manager Research & Consumer Insights", company: "Philip Morris International", linkedinUrl: null, washResult: null },
  { firstName: "Shikha", lastName: "Mahajan", jobRole: "Vice President Strategy and Program Delivery EU", company: "Philip Morris International", linkedinUrl: null, washResult: null },
  { firstName: "Jessica", lastName: "Danaher", jobRole: "Director of Market Development", company: "Oxoid Remel Microbiology", linkedinUrl: null, washResult: null },
  { firstName: "Christopher", lastName: "Wadsworth", jobRole: "Executive Coach & Clinical Hypnotherapist", company: null, linkedinUrl: null, washResult: null },
  { firstName: "Susan", lastName: "Stark", jobRole: "Senior HR Director Market Operations Europe", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
  { firstName: "Sophia", lastName: "Burcher", jobRole: "Global Brand Experience Lead", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Jennifer", lastName: "Kuek", jobRole: "AVP Head of Tax Zone AOA", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Luis Eduardo", lastName: "Checo Manrique", jobRole: "IT Product Manager Procurement", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Celestine", lastName: "Yeoh", jobRole: "Engineering Specialist", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Pedro", lastName: "Varela", jobRole: "Global Head Group Accounting and Reporting", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Ralf", lastName: "Hubenthal", jobRole: "Global Head of IT & Digital Platforms", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "David", lastName: "Grebert", jobRole: "Group Vice President Head of Brand Building", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
  { firstName: "Antonia", lastName: "Farquhar", jobRole: "Global Head Media and Partnerships", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Margo", lastName: "Williams", jobRole: "Head of Operations SBU Food", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Anton", lastName: "De Groeve", jobRole: "Director Business Planning Home Care", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
  { firstName: "Mark", lastName: "Vodden", jobRole: "Global HR Organisation Design and Development Lead", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Craig", lastName: "Connolly", jobRole: "Global Head of Financial Services", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Rafiqul", lastName: "Islam", jobRole: "S2P Integration Data & Analytics Lead", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Tomas", lastName: "Andracsik", jobRole: "Senior Director of Operations", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
  { firstName: "Antoine", lastName: "Brun", jobRole: "Senior Vice President Sales Europe", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
  { firstName: "Vinay", lastName: "Khadria", jobRole: "Global Finance Transformation Lead", company: "Nestle", linkedinUrl: null, washResult: null },
  { firstName: "Mindaugas", lastName: "Zeromskis", jobRole: "Brand Director Healthcare Europe", company: "Procter & Gamble", linkedinUrl: null, washResult: null },
]
