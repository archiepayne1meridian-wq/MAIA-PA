// Seeds ATHENA's CII qualification track — R01 (Financial Services, Regulation
// and Ethics) and R06 (Financial Planning Practice). 15+ cards per module,
// drawn from public CII syllabus content and the UK tax/regulatory facts
// already established elsewhere in this codebase (deVere training material,
// e.g. pension access age rising to 57 in 2028, IHT on pensions from April
// 2027, the October 2024 QROPS 25% Overseas Transfer Charge).
//
// There is no standalone "modules" table — a module exists once it has at
// least one card tagged with its name, track:'qualification' and the relevant
// exam. Idempotent — re-running skips any card whose front text already
// exists for its module+track+exam.
//
// Run: npx tsx --env-file=.env scripts/seed-cii-flashcards.ts

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { study_cards } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { addCards } from '../tools/study-db'
import type { Exam } from '../tools/study-db'

interface CardSeed { front: string; back: string }

// ─── R01 — Financial Services, Regulation and Ethics ──────────────────────

const R01_MODULES: Record<string, CardSeed[]> = {
  'The Financial Services Industry': [
    { front: 'What is the structure of UK financial regulation since 2013?', back: 'A "twin peaks" model — the Prudential Regulation Authority (PRA) supervises the safety and soundness of banks, insurers and major investment firms, while the Financial Conduct Authority (FCA) regulates conduct and consumer protection across nearly all financial services firms.' },
    { front: 'What is the difference between a bank and a building society?', back: 'A bank is a company owned by shareholders; a building society is a mutual, owned by its members (savers and borrowers), historically focused on mortgage lending and savings.' },
    { front: 'What does "independent advice" mean under COBS?', back: 'Advice based on a comprehensive and fair analysis of the relevant market, unrestricted by any product provider — the adviser can recommend any suitable retail investment product.' },
    { front: 'What does "restricted advice" mean?', back: 'Advice that is not independent — the firm may only recommend its own products, a limited range of products, or a limited range of providers, but must disclose this restriction to the client.' },
    { front: 'Under COBS, who is a "retail client"?', back: 'A client who is not an eligible counterparty or a professional client — the default classification, receiving the highest level of regulatory protection.' },
    { front: 'Who is a "professional client"?', back: 'A client with the experience, knowledge and expertise to make their own investment decisions and assess the risks involved — e.g. large undertakings, regulated financial institutions, or opted-up individuals meeting set criteria.' },
    { front: 'What role does a platform play in the advice chain?', back: 'An online administration service that holds a client\'s investments in a single account and provides dealing, valuation and reporting — it is not itself an adviser or product provider.' },
    { front: "What is a product provider's role?", back: 'The firm that manufactures and is responsible for a financial product — e.g. an insurer providing an annuity, a fund manager providing a unit trust.' },
    { front: 'What is an intermediary?', back: 'A firm or individual that arranges or advises on financial products between the provider and the client, without itself being the provider.' },
    { front: 'What is the difference between a life insurance company and a general insurer?', back: 'Life insurers write long-term contracts (life assurance, pensions, annuities); general insurers write short-term contracts (motor, home, travel).' },
    { front: 'What does an IFA network provide to its member firms?', back: 'A group of directly authorised or appointed representative firms operating under a central compliance and support structure, sharing back-office and regulatory infrastructure.' },
    { front: 'What does "appointed representative" (AR) mean?', back: "A firm or individual carrying on regulated activities under the FCA authorisation of another firm (the \"principal\"), who takes responsibility for the AR's compliance." },
    { front: 'What is the role of the Financial Ombudsman Service (FOS)?', back: 'An independent body that resolves disputes between consumers and financial firms free of charge, with decisions binding on the firm (up to the relevant award limit) if the consumer accepts.' },
    { front: 'What is the role of the Financial Services Compensation Scheme (FSCS)?', back: "The UK's statutory compensation fund of last resort, paying consumers if an authorised firm fails and cannot meet its liabilities." },
    { front: 'What is a mutual society, and give an example type?', back: 'An organisation owned by its members rather than shareholders, with profits used to benefit members — e.g. building societies, friendly societies.' },
    { front: 'What is the main distinction between wholesale and retail financial markets?', back: 'Wholesale markets involve transactions between financial institutions themselves (e.g. interbank lending); retail markets involve transactions with individual consumers.' },
    { front: 'What is a Designated Professional Body (DPB)?', back: "A professional body (e.g. the Law Society, ICAEW) authorised to regulate its members' incidental financial services activities without those members needing separate FCA authorisation, provided strict conditions are met." },
    { front: 'What is the difference between "advised" and "non-advised" (execution-only) sales?', back: 'Advised sales include a personal recommendation and full suitability assessment; non-advised/execution-only sales involve the client making their own decision without a personal recommendation, though an appropriateness test may still apply for complex products.' },
  ],
  'The Regulatory Framework': [
    { front: 'What is FSMA 2000?', back: "The Financial Services and Markets Act 2000 — the primary legislation establishing the UK's statutory framework for regulating financial services, including the FCA's and PRA's powers." },
    { front: "What are the FCA's three statutory objectives?", back: "1. Consumer protection — securing appropriate protection for consumers. 2. Market integrity — protecting and enhancing the integrity of the UK financial system. 3. Competition — promoting effective competition in the interests of consumers." },
    { front: "What is the PRA's main objective?", back: 'To promote the safety and soundness of the firms it regulates (banks, building societies, credit unions, insurers, major investment firms), focusing on prudential (financial stability) regulation.' },
    { front: 'What is the Senior Managers & Certification Regime (SM&CR)?', back: 'A regulatory framework making individuals personally accountable for their conduct and competence — Senior Managers hold pre-approved, defined responsibilities; Certified staff are assessed annually as fit and proper by their firm.' },
    { front: 'What is a "Senior Manager Function" (SMF)?', back: 'A role requiring prior FCA/PRA approval before the individual can perform it, because they hold key decision-making responsibility within the firm.' },
    { front: 'What is the Duty of Responsibility under SM&CR?', back: 'A Senior Manager must take reasonable steps to prevent regulatory breaches in the area they are responsible for — if a breach occurs, they must show they took those steps.' },
    { front: 'What is the difference between authorisation and permission under FSMA?', back: 'Authorisation allows a firm to carry on regulated activities. Permission specifies WHICH regulated activities that firm is authorised to carry on. A firm can be authorised but only have permission for specific activities.' },
    { front: 'What is a "regulated activity"?', back: 'An activity specified in the FSMA (Regulated Activities) Order 2001 that requires FCA/PRA authorisation to carry on by way of business — e.g. advising on investments, arranging deals, managing investments.' },
    { front: 'What is the "general prohibition" under FSMA?', back: 'No person may carry on a regulated activity in the UK unless authorised or exempt — doing so is a criminal offence.' },
    { front: 'How does the FCA supervise firms day to day?', back: 'Through a mix of proactive supervision (regular contact with larger firms), thematic reviews across a sector, reactive supervision (responding to issues raised), and data/return monitoring.' },
    { front: 'What powers can the FCA use against a firm that breaches its rules?', back: "Public censure, financial penalties (fines), varying or cancelling a firm's permissions, and in serious cases prosecuting criminal offences." },
    { front: 'What is the Financial Policy Committee (FPC)?', back: 'A Bank of England committee responsible for identifying, monitoring and taking action to remove or reduce systemic risks to UK financial stability.' },
    { front: 'What is the difference between the FCA Handbook and guidance?', back: 'Handbook rules are binding requirements firms must follow; guidance explains how the FCA interprets rules and expects firms to comply, and is persuasive but not itself binding.' },
    { front: 'What is "passporting," and how has it changed since Brexit?', back: 'The pre-Brexit ability for a firm authorised in one EEA state to operate across the EEA without separate authorisation in each state. UK firms lost automatic EEA passporting after Brexit and now need local permissions or equivalence arrangements.' },
    { front: 'What is the Money Laundering Reporting Officer (MLRO)?', back: "The individual within a firm responsible for oversight of the firm's anti-money laundering systems and for receiving and assessing internal suspicious activity reports." },
    { front: 'Who is the Financial Conduct Authority accountable to?', back: 'HM Treasury and Parliament — the FCA is operationally independent but publicly accountable, funded by fees levied on the firms it regulates.' },
    { front: 'What is a "threshold condition" under FSMA?', back: 'The minimum standards a firm must meet and continue to meet to be given and keep FCA/PRA authorisation — e.g. suitability, appropriate resources, legal status.' },
  ],
  'Conduct of Business': [
    { front: 'What is the FCA Conduct of Business Sourcebook (COBS)?', back: 'The section of the FCA Handbook setting out detailed rules on how firms must conduct business with clients — covering client categorisation, suitability, disclosure, and financial promotions.' },
    { front: 'What replaced Treating Customers Fairly (TCF) as the FCA\'s overarching conduct standard in 2023?', back: "The Consumer Duty — a higher standard requiring firms to act to deliver good outcomes for retail customers, though TCF's six outcomes remain a useful underlying framework." },
    { front: 'What are the six TCF outcomes?', back: "1. Fair treatment is central to corporate culture. 2. Products designed to meet target market needs. 3. Clear information before, during, and after sale. 4. Suitable advice in regulated sales. 5. Products perform as expected, service is acceptable. 6. No unreasonable post-sale barriers." },
    { front: 'What does "suitability" mean in an advice context?', back: 'A personal recommendation must be appropriate for the client, based on their personal and financial circumstances, knowledge and experience, and investment objectives (including risk tolerance and capacity for loss).' },
    { front: 'How must suitability be evidenced?', back: 'Via a suitability report, setting out the client\'s objectives, why the recommendation meets them, and any disadvantages, given to the client (in most cases) before or immediately after the transaction.' },
    { front: 'What is a "fact find"?', back: "The process and document used to gather a client's personal, financial, and objective information necessary to give suitable advice." },
    { front: 'What is Know Your Customer (KYC)?', back: "The process of verifying a client's identity and understanding their circumstances, both for suitability purposes and to meet anti-money laundering obligations." },
    { front: 'What are the four Consumer Duty outcomes?', back: '1. Products and services. 2. Price and value. 3. Consumer understanding. 4. Consumer support.' },
    { front: 'What is the FCA\'s Consumer Duty cross-cutting rule on "acting in good faith"?', back: 'Firms must act honestly, fairly, and openly with retail customers, alongside avoiding foreseeable harm and enabling customers to pursue their financial objectives.' },
    { front: 'What is GDPR, in a UK context post-Brexit?', back: 'The UK GDPR, retained from EU law and sitting alongside the Data Protection Act 2018, governing how firms collect, process, and store personal data.' },
    { front: 'What are the key GDPR principles relevant to financial advice?', back: 'Lawfulness, fairness and transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity and confidentiality; accountability.' },
    { front: 'What is a client\'s "right to be forgotten" under GDPR?', back: "The right to request erasure of their personal data, subject to exceptions such as a firm's legal or regulatory record-keeping obligations." },
    { front: 'What is "churning"?', back: "Excessive buying and selling of a client's investments primarily to generate commission or charges for the adviser/firm rather than to serve the client's interests — a conduct breach." },
    { front: 'What must a financial promotion comply with under COBS?', back: 'It must be clear, fair and not misleading, and (unless from an authorised person or approved by one) generally cannot be communicated to the public.' },
    { front: 'What is the "appropriateness test," and when does it apply instead of suitability?', back: 'Used for non-advised/execution-only sales of complex products — the firm assesses whether the client has the knowledge and experience to understand the risks, without assessing broader suitability.' },
    { front: 'What is vulnerability, in FCA conduct terms?', back: 'A characteristic (e.g. poor health, life events, low resilience, low capability) that means a consumer is especially susceptible to harm, particularly if a firm is not acting with appropriate care.' },
  ],
  'Financial Crime': [
    { front: 'What are the three stages of money laundering?', back: "1. Placement — introducing criminal funds into the financial system. 2. Layering — disguising the trail through complex transactions. 3. Integration — the money re-enters the economy appearing legitimate." },
    { front: 'How does terrorist financing typically differ from money laundering?', back: 'Terrorist financing often uses legitimately-sourced funds for an illegitimate purpose, whereas money laundering disguises illegitimately-sourced funds to make them appear legitimate.' },
    { front: 'What is the Proceeds of Crime Act 2002 (POCA)?', back: 'The primary UK legislation creating money laundering offences, including failure to report, tipping off, and dealing with criminal property, and providing for confiscation of criminal assets.' },
    { front: 'What is a Suspicious Activity Report (SAR)?', back: 'A report made to the National Crime Agency (NCA) when a person knows or suspects (or has reasonable grounds to suspect) that property is derived from criminal conduct.' },
    { front: 'What is tipping off?', back: 'Telling a person or their associates that a Suspicious Activity Report (SAR) has been made about them, or that a money laundering investigation is underway. It is a criminal offence under the Proceeds of Crime Act 2002.' },
    { front: 'What is Customer Due Diligence (CDD)?', back: 'The process of identifying a customer and verifying their identity using reliable, independent source documents or data, undertaken before establishing a business relationship.' },
    { front: 'What is Enhanced Due Diligence (EDD), and when is it required?', back: 'A higher level of scrutiny applied to higher-risk customers — e.g. Politically Exposed Persons (PEPs), customers from high-risk third countries, or complex/unusual transactions.' },
    { front: 'Who is a Politically Exposed Person (PEP)?', back: 'An individual entrusted with a prominent public function (e.g. head of state, senior politician, senior judicial or military official) or their family members/close associates, presenting a higher money laundering risk due to potential abuse of position.' },
    { front: 'What are the Money Laundering Regulations 2017 (as amended)?', back: 'UK regulations implementing anti-money laundering and counter-terrorist financing requirements on regulated firms, including CDD, record-keeping, and risk assessment obligations.' },
    { front: 'What is the Bribery Act 2010 — what are its key offences?', back: 'Offering, promising or giving a bribe; requesting, agreeing to receive or accepting a bribe; bribing a foreign public official; and a corporate offence of failing to prevent bribery by an associated person.' },
    { front: 'What defence is available to the corporate offence under the Bribery Act 2010?', back: 'Showing the organisation had "adequate procedures" in place designed to prevent bribery.' },
    { front: "What is the National Crime Agency's (NCA) role in financial crime?", back: 'The UK\'s lead agency for tackling serious and organised crime, including receiving and analysing SARs and pursuing financial investigations.' },
    { front: 'What record-keeping period generally applies to CDD and transaction records under the Money Laundering Regulations?', back: 'Five years from the end of the business relationship or the date of the transaction.' },
    { front: 'What is a Defence Against Money Laundering (DAML)?', back: 'Consent sought from the NCA before proceeding with a transaction suspected to involve criminal property — proceeding without it (or before the notice period expires) risks a laundering offence.' },
    { front: 'What is "smurfing" (structuring)?', back: 'Breaking up a large sum of criminal money into smaller transactions to avoid triggering reporting thresholds or detection — a placement-stage technique.' },
    { front: 'What is the "failure to report" offence under POCA?', back: 'A person in the regulated sector who knows or suspects money laundering, and fails to disclose it as soon as practicable, commits an offence — even without personal involvement in the laundering itself.' },
  ],
  'Ethics in Financial Services': [
    { front: 'What does "ethics" mean in a financial services context?', back: 'The application of moral principles — honesty, integrity, and fairness — to the way firms and individuals treat clients and conduct business, going beyond minimum legal/regulatory compliance.' },
    { front: 'How does the FCA describe the relationship between culture and conduct?', back: 'Firm culture drives the behaviours and decisions of staff — poor culture (e.g. sales-driven incentives) is a root cause of poor conduct outcomes, so the FCA supervises culture as well as rules.' },
    { front: 'What is a conflict of interest?', back: "A situation where a firm's or individual's own interests (or another client's interests) could improperly influence advice or dealings given to a client." },
    { front: 'How should a firm manage a conflict of interest under COBS?', back: 'Identify it, maintain effective organisational arrangements to prevent it affecting client interests, and if it cannot be managed, disclose it clearly to the client or decline to act.' },
    { front: 'What protections exist for whistleblowers in financial services?', back: 'The Public Interest Disclosure Act 1998 protects workers from detriment/dismissal for making a protected disclosure; firms must also have an internal whistleblowing channel and a nominated whistleblowing champion (for larger firms).' },
    { front: "What is the CII Code of Ethics's core principle?", back: 'Members must always act with the highest standards of integrity, always put the interests of clients first, and never bring the profession into disrepute.' },
    { front: 'What are the key elements of the CII Code of Ethics?', back: "Integrity, always place the client's interests at the centre of professional practice, provide a high standard of service, treat people fairly regardless of background, and maintain the reputation of the profession." },
    { front: 'What is an ethical decision-making framework often taught for ambiguous situations?', back: 'Identify the facts and stakeholders → identify the ethical issue → consider relevant principles/duties → consider the consequences of each option → decide and be able to justify the decision.' },
    { front: 'Why might a legal action still be unethical?', back: "Because law sets a legal minimum; ethics asks whether an action is right or fair even where it isn't explicitly prohibited — e.g. selling a technically suitable but poor-value product." },
    { front: 'What is meant by "professional standards" in the CII context?', back: 'The combination of technical competence (qualifications, CPD) and ethical conduct expected of a member, underpinning public trust in the profession.' },
    { front: 'What is Continuing Professional Development (CPD), and why does it matter ethically?', back: 'Ongoing learning required to keep knowledge and skills current — maintaining CPD is an ethical obligation to remain competent to advise clients.' },
    { front: 'What ethical issue arises from commission-based remuneration?', back: 'It can create an incentive to recommend a product that pays more commission rather than the product that is genuinely best for the client — a structural conflict of interest.' },
    { front: 'What does "acting with integrity" mean in practice for an adviser?', back: 'Being honest and straightforward in all dealings, not misleading clients, and being willing to admit and correct mistakes.' },
    { front: 'Why is client confidentiality an ethical as well as a legal obligation?', back: "Trust is central to the adviser-client relationship — breaching confidentiality (even where not strictly unlawful) undermines that trust and the profession's reputation." },
    { front: "What should an adviser do if asked to act in a way that conflicts with their ethical principles but isn't clearly illegal?", back: 'Raise the concern through appropriate channels (e.g. compliance, a senior manager, or if necessary whistleblowing) rather than simply comply.' },
    { front: "What is the purpose of a firm's Conflicts of Interest Policy?", back: 'A documented policy setting out how the firm identifies, prevents, and manages conflicts of interest between itself, its staff, and its clients, required under COBS/SYSC.' },
  ],
}

// ─── R06 — Financial Planning Practice ──────────────────────────────────────

const R06_MODULES: Record<string, CardSeed[]> = {
  'The Financial Planning Process': [
    { front: 'What are the six steps of the financial planning process?', back: '1. Establish and define the client relationship. 2. Gather client data and determine goals. 3. Analyse and evaluate the client\'s financial status. 4. Develop and present recommendations. 5. Implement the recommendations. 6. Review the client\'s situation periodically.' },
    { front: 'What is the difference between "hard facts" and "soft facts" in a fact find?', back: 'Hard facts are objective, verifiable data — income, assets, liabilities, dates of birth. Soft facts are subjective — attitudes, goals, fears, priorities, family dynamics.' },
    { front: 'What is the difference between attitude to risk and capacity for loss?', back: "Attitude to risk is psychological — how comfortable someone is with the idea of their investments falling in value. Capacity for loss is financial — how much they can actually afford to lose without affecting their standard of living. Both must be assessed; the lower of the two determines the appropriate risk level." },
    { front: 'What does PEPSI stand for in the financial planning priority order?', back: 'Protection, Estate Planning, Pensions, Savings, Investment — reflecting the order in which needs are typically prioritised, protecting the downside before building the upside.' },
    { front: 'Why does protection typically come before investment in the planning priority order?', back: 'There is little value building investment wealth that could be wiped out by an unprotected risk (death, illness, loss of income) before it has time to grow.' },
    { front: 'What is the purpose of a suitability report?', back: 'To present recommendations to the client in writing, explaining why they are suitable given the client\'s circumstances and objectives, and setting out any disadvantages or risks.' },
    { front: 'What is meant by a client\'s "objectives" in the planning process, and why must they be prioritised?', back: 'The specific goals a client wants to achieve (e.g. retire at 60, protect the family, buy a property) — they must be prioritised because resources are usually insufficient to meet every objective at once.' },
    { front: 'Why is a periodic review a formal step in the financial planning process, not an optional extra?', back: 'Circumstances, legislation, and product performance change over time — a plan that was suitable at outset can become unsuitable without review.' },
    { front: 'What is a "risk profiling questionnaire," and what are its limits?', back: "A structured set of questions used to gauge a client's psychological attitude to investment risk — it is a starting point for discussion, not a substitute for professional judgement, and doesn't measure capacity for loss." },
    { front: "Why might a client's stated attitude to risk differ from their behaviour in a market downturn?", back: 'Stated risk tolerance is often optimistic in calm markets — real behaviour under stress can reveal lower actual tolerance than the questionnaire suggested.' },
    { front: 'What must an adviser do if a client insists on an unsuitable course of action?', back: "Explain clearly why it is not recommended, document the discussion and the client's decision, and (depending on the firm's policy) may decline to proceed on an advised basis." },
    { front: 'What is "goals-based" financial planning?', back: 'An approach that structures the plan and portfolio around specific client goals (e.g. retirement, house purchase, school fees) rather than a single generic risk-based portfolio.' },
    { front: "What information must typically be captured about a client's existing arrangements during fact-finding?", back: 'Existing pensions, investments, protection policies, debts, income and expenditure, and any other assets or liabilities relevant to the advice being given.' },
    { front: "Why is understanding a client's expenditure as important as their income in the planning process?", back: 'Affordability and capacity for loss depend on disposable income after essential and discretionary expenditure, not gross income alone.' },
    { front: 'What is meant by "shortfall analysis"?', back: "Comparing a client's projected resources against their objectives (e.g. retirement income needed vs projected pension income) to identify and quantify any gap." },
    { front: 'Why must a suitability report avoid jargon?', back: 'The client must be able to understand the basis of the recommendation — the FCA requires communications to be clear, fair and not misleading, which includes being comprehensible to the intended audience.' },
  ],
  'Protection Planning': [
    { front: 'What is level term assurance?', back: 'Life cover for a fixed term, paying a fixed sum assured on death within the term; the sum assured and premium remain level throughout.' },
    { front: 'What is decreasing term assurance, and what is it typically used for?', back: "Cover where the sum assured reduces over the term, often in line with a repayment mortgage balance — used for mortgage protection." },
    { front: 'What is family income benefit (FIB)?', back: 'A type of decreasing term assurance that pays a regular income (rather than a lump sum) from the date of death to the end of the term, if death occurs within it.' },
    { front: 'What is whole of life assurance?', back: 'Life cover with no fixed term — it pays out whenever death occurs, provided premiums are maintained, commonly used for estate planning or funeral cost provision.' },
    { front: 'What does critical illness cover (CIC) pay out on?', back: 'A tax-free lump sum on diagnosis of one of a list of specified serious illnesses or conditions defined in the policy (e.g. cancer, heart attack, stroke), subject to policy definitions being met.' },
    { front: 'What are common exclusions on critical illness cover?', back: 'Pre-existing conditions not disclosed, self-inflicted injury, and conditions not meeting the policy\'s specific severity definitions (e.g. certain early-stage cancers may be excluded or paid at a reduced amount).' },
    { front: 'What is the difference between "own occupation" and "any occupation" income protection?', back: 'Own occupation pays out if the policyholder cannot perform their own specific job; any occupation only pays out if they cannot perform any job they are reasonably suited to by training/experience — own occupation is more generous and more expensive.' },
    { front: 'What is a deferred period on an income protection policy?', back: 'The waiting period between the start of incapacity and when benefit payments begin — a longer deferred period generally reduces the premium.' },
    { front: 'What is key person protection?', back: 'Insurance taken out by a business on the life (or health) of an employee whose loss would cause significant financial harm to the business, with the business as both payer and beneficiary.' },
    { front: 'What is shareholder protection insurance, and what does it typically fund?', back: "Life cover on each shareholder/business partner, structured (often with a cross-option agreement) so surviving shareholders can buy the deceased's shares from their estate rather than losing control of the business." },
    { front: 'What is a cross-option agreement in shareholder protection?', back: "An agreement giving surviving shareholders the option to buy, and the deceased's estate the option to sell, the deceased's shares — avoiding a forced sale while keeping the arrangement outside a binding buy-and-sell agreement (which could jeopardise Business Property Relief)." },
    { front: 'Why does protection planning typically come before investment planning in advice priority?', back: 'An unprotected risk (death, critical illness, loss of income) could derail or wipe out investment progress — protection secures the foundation the rest of the plan depends on.' },
    { front: 'What is a "guaranteed insurability option" on a protection policy?', back: 'An option allowing the policyholder to increase cover at specified future life events (e.g. marriage, birth of a child) without further medical underwriting.' },
    { front: 'What is waiver of premium, and why is it often added to protection policies?', back: 'A rider benefit that suspends premium payments (while keeping cover in force) if the policyholder becomes unable to work through illness or injury — protecting the policy itself from lapsing.' },
    { front: 'How is a critical illness claim typically taxed for a personal policy?', back: 'Tax-free — a personal critical illness lump sum is not subject to income tax or capital gains tax.' },
    { front: 'What is relevant life cover, and who is it typically used for?', back: 'A tax-efficient form of death-in-service life cover an employer can provide to an individual employee (often a director) outside a group scheme — premiums are usually an allowable business expense and not a taxable benefit in kind, and proceeds are normally paid free of inheritance tax via trust.' },
  ],
  'Retirement Planning': [
    { front: 'What are "qualifying years" for the UK state pension?', back: 'Tax years in which someone paid, or was credited with, sufficient National Insurance contributions — 35 qualifying years are typically needed for the full new State Pension.' },
    { front: 'What is the "triple lock"?', back: "The UK Government's commitment to increase the State Pension each year by the highest of average earnings growth, CPI inflation, or 2.5%." },
    { front: 'How does a defined contribution (DC) pension work?', back: 'Contributions from the individual, employer, and tax relief are invested, and the eventual pension depends on the fund built up and investment performance — the member bears the investment risk.' },
    { front: 'How does a defined benefit (DB) pension work?', back: 'The scheme promises a specified income in retirement, usually calculated as years of service × accrual rate × salary — the scheme (employer) bears the investment and longevity risk.' },
    { front: 'What is a CETV?', back: 'Cash Equivalent Transfer Value. The lump sum a defined benefit pension scheme offers in exchange for giving up the right to a future guaranteed income. Transferring a DB pension worth over £30,000 requires regulated financial advice.' },
    { front: 'What are the main risks of transferring out of a DB pension?', back: 'Losing a guaranteed, inflation-linked income for life; taking on investment and longevity risk personally; and the risk the transferred fund is poorly managed or depleted too quickly.' },
    { front: 'What is the pension minimum access age and when does it change?', back: 'Currently 55. Rising to 57 in 2028 under the Finance Act 2022. This is the earliest age most people can access pension savings without a serious ill-health exception.' },
    { front: 'What is pension drawdown?', back: 'A way of taking a pension where the fund stays invested and the member draws an income (and/or lump sums) directly from it, retaining flexibility but also investment and longevity risk.' },
    { front: 'What is an annuity?', back: 'A guaranteed income for life (or a fixed term) purchased with pension funds, in exchange for giving up the capital — provides certainty but no flexibility and no death benefit once purchased (unless guarantee/value-protection options are added).' },
    { front: 'What is the main trade-off between drawdown and an annuity?', back: 'Drawdown offers flexibility and investment growth potential but carries the risk of running out of money; an annuity offers guaranteed income for life but no flexibility and typically no residual value.' },
    { front: "What happens to pension death benefits, generally, depending on the member's age at death?", back: 'Death before age 75 is normally paid tax-free to beneficiaries (within the relevant allowance); death at or after 75 is generally taxed as income on the beneficiary when withdrawn.' },
    { front: 'Why does the nomination of beneficiaries (expression of wish) matter for a pension?', back: "Most pensions are held in a discretionary trust structure outside the estate, so it is the scheme trustees — guided by, but not strictly bound by, the member's nomination — who decide who receives death benefits, making an up-to-date nomination essential." },
    { front: 'What is happening to pensions and inheritance tax from April 2027?', back: "Unused pension funds fall inside the deceased's estate for inheritance tax purposes. Previously pensions were outside the estate — this is a significant change affecting anyone with UK pension savings, including non-residents with the IHT tail." },
    { front: 'What is QROPS, and what changed on overseas pension transfers in October 2024?', back: 'A Qualified Recognised Overseas Pension Scheme, used to transfer UK pension benefits abroad. Since October 2024, a 25% Overseas Transfer Charge applies unless the member lives in the same country as the QROPS (the old EEA-wide exemption was removed).' },
    { front: 'What happened to the pensions Lifetime Allowance (LTA) in 2024?', back: 'It was formally abolished from 6 April 2024, replaced by new allowances limiting tax-free lump sums — the Lump Sum Allowance (LSA) and Lump Sum and Death Benefit Allowance (LSDBA).' },
    { front: 'What is the pension Annual Allowance?', back: 'The maximum amount of pension contributions (from all sources combined) that can receive tax relief in a tax year — currently £60,000 for most people, subject to tapering for high earners and a lower Money Purchase Annual Allowance once benefits have been flexibly accessed.' },
    { front: 'What is pension recycling, and why is it a compliance concern?', back: 'Using a tax-free pension lump sum to make further, artificially increased pension contributions to gain additional tax relief — HMRC rules can treat this as an unauthorised payment subject to penal tax charges if certain thresholds/conditions are met.' },
  ],
  'Investment Planning': [
    { front: 'What are the main asset classes covered in investment planning?', back: 'Equities (shares), bonds (fixed interest), property, cash, and alternatives (e.g. commodities, private equity, absolute return funds).' },
    { front: 'What is the general relationship between risk and expected return?', back: 'Higher potential returns are generally associated with higher risk (volatility/possible loss) — an investor typically must accept more risk to have a reasonable prospect of a higher return.' },
    { front: 'What is diversification, and why does it reduce risk?', back: 'Spreading investments across different asset classes, sectors, and geographies so that poor performance in one area is offset by others, reducing overall portfolio volatility without necessarily reducing expected return.' },
    { front: 'What is asset allocation?', back: "The process of dividing a portfolio between different asset classes according to the investor's objectives, risk tolerance, and time horizon — the single biggest driver of a portfolio's overall risk and return characteristics." },
    { front: 'What is portfolio rebalancing, and why is it necessary?', back: "Periodically buying/selling holdings to return a portfolio to its target asset allocation, since different assets grow at different rates and drift the portfolio away from its intended risk level over time." },
    { front: 'What are the key tax-efficient wrappers available to UK investors?', back: 'The ISA (Individual Savings Account), the pension, and (for specific circumstances) the offshore/onshore investment bond — each with different tax treatment on growth, income, and withdrawal.' },
    { front: 'What is a General Investment Account (GIA), and how is it taxed?', back: 'An unwrapped investment account with no contribution limits, but fully taxable — income tax on dividends/interest and capital gains tax on gains as they are realised.' },
    { front: 'What is an ISA, and what is its current annual allowance?', back: 'A tax-free wrapper for cash and/or investments — £20,000 per tax year (2025/26), with no income tax or capital gains tax on growth or withdrawals.' },
    { front: 'What is an investment platform, and is it itself a tax wrapper?', back: 'An online administration service holding a client\'s investments (potentially across several wrappers, e.g. ISA and GIA) in one place — it is tax-neutral "plumbing," not a wrapper itself, and charges its own separate platform fee.' },
    { front: 'What is the difference between an OEIC and a unit trust?', back: 'Both are pooled collective investments; an OEIC (Open-Ended Investment Company) is structured as a company issuing shares, while a unit trust is structured as a trust issuing units — functionally similar for most investors.' },
    { front: 'What is an ETF (Exchange-Traded Fund)?', back: 'A pooled fund, typically tracking an index, that trades on a stock exchange throughout the day like a share, usually with lower charges than an actively managed fund.' },
    { front: 'What does "active" vs "passive" fund management mean?', back: 'Active management involves a manager selecting investments to try to outperform a benchmark (for a higher fee); passive management simply tracks an index or benchmark (for a lower fee).' },
    { front: 'What is a structured product, and what are its key risks?', back: 'An investment with a return linked to the performance of an underlying index or asset over a defined term, with defined potential outcomes — key risks include capital risk (loss if the underlying falls) and counterparty risk (the issuing institution failing).' },
    { front: 'How should charges factor into selecting a platform or fund?', back: 'Charges compound over time and directly reduce net returns ("cost drag") — even a seemingly small annual charge difference can materially affect the outcome over a long time horizon.' },
    { front: 'What is pound cost averaging?', back: 'Investing a fixed amount at regular intervals, which buys more units when prices are low and fewer when prices are high, smoothing the average purchase price over time.' },
    { front: 'What is investment time horizon, and why does it matter for asset allocation?', back: 'The length of time before the invested money is needed — a longer horizon generally allows more capacity to hold higher-risk, higher-growth assets, since there is more time to recover from short-term volatility.' },
  ],
  'Tax Planning': [
    { front: 'What are the current UK income tax bands (England, 2025/26), roughly?', back: 'Personal allowance £12,570 (0%), basic rate 20% up to £50,270, higher rate 40% up to £125,140, additional rate 45% above £125,140.' },
    { front: 'What is the "60% band" in UK income tax, and why does almost nobody know it exists?', back: 'Between £100,000–£125,140, the personal allowance tapers at £1 for every £2 earned, making the real marginal rate 60% — a hidden effect of the taper, not a published rate.' },
    { front: 'What is the capital gains tax (CGT) annual exempt amount for 2025/26?', back: '£3,000 per individual — gains above this are taxable, at rates depending on the asset type and the individual\'s income tax band.' },
    { front: 'How is capital gains tax planning commonly used to reduce a tax bill?', back: "Using the annual exempt amount each year rather than letting it go unused, spreading disposals across tax years, and considering spousal transfers (which are generally CGT-free) to use both partners' allowances." },
    { front: 'What is the UK inheritance tax nil rate band and residence nil rate band?', back: 'Nil rate band: £325,000 (frozen until at least 2028). Residence nil rate band: £175,000 (when the main home passes to direct descendants). Combined: £500,000 per person, £1,000,000 for married couples/civil partners.' },
    { front: 'What is the standard rate of UK inheritance tax?', back: '40% on the value of the estate above the available nil rate band(s), reducing to 36% if at least 10% of the net estate is left to charity.' },
    { front: 'What is the spousal exemption for inheritance tax?', back: 'Transfers between UK-domiciled (or equivalently treated) spouses/civil partners are generally exempt from inheritance tax without limit, whether made during lifetime or on death.' },
    { front: 'What happens to unused pension funds for inheritance tax from April 2027?', back: 'They come within the deceased\'s estate for IHT purposes for the first time — previously most pensions sat outside the estate entirely.' },
    { front: 'What double taxation relief exists for someone taxed on the same income by two countries?', back: 'Double taxation treaties (DTAs) between countries, which typically allocate taxing rights and/or provide a credit in one country for tax already paid in the other, preventing the same income being taxed twice in full.' },
    { front: "What is the UK's approach to taxing non-UK residents, broadly?", back: 'Non-residents are generally only taxed on UK-source income (e.g. UK rental income, UK pensions in many cases) and UK property gains, not on their worldwide income.' },
    { front: "What replaced the UK's non-dom regime from April 2025?", back: 'A new residence-based regime — new arrivals can benefit from a time-limited Foreign Income and Gains (FIG) exemption for their first four years of UK tax residence, after which worldwide income and gains become taxable as for any UK resident.' },
    { front: 'How did UK inheritance tax exposure change from domicile-based to residence-based on 6 April 2025?', back: 'Someone UK tax resident for 10 of the last 20 tax years now has their worldwide estate in scope for UK IHT, regardless of domicile — replacing the previous domicile-based test.' },
    { front: 'What is the IHT "tail" after someone leaves the UK?', back: "At least three years, and up to ten, depending on how long they lived in the UK — leaving doesn't switch off UK IHT exposure immediately." },
    { front: 'What are the main annual tax allowances/exemptions relevant to tax planning?', back: 'The personal allowance (income tax), the ISA allowance, the CGT annual exempt amount, the pension annual allowance, and the £3,000 annual gift exemption (IHT).' },
    { front: 'What is dividend tax, and what is the dividend allowance for 2025/26?', back: 'Tax charged on dividend income above the £500 dividend allowance, at rates of 8.75% (basic), 33.75% (higher), and 39.35% (additional rate), on top of the personal allowance.' },
    { front: 'What is a "Bed and ISA" transaction?', back: 'Selling an investment held outside an ISA (potentially realising a CGT gain/loss) and immediately repurchasing the same investment within an ISA, moving future growth into a tax-free wrapper.' },
    { front: 'Why is timing of income and gains a key tax planning tool across tax years?', back: 'Because allowances (personal allowance, CGT exempt amount, dividend allowance) reset annually and cannot generally be carried forward, spreading realisations across tax years can materially reduce the overall tax paid.' },
  ],
  'Estate Planning': [
    { front: 'Why does having a valid will matter for estate planning?', back: 'It ensures the estate passes according to the deceased\'s wishes rather than the statutory intestacy rules, and allows for tax-efficient structuring (e.g. use of trusts, RNRB planning).' },
    { front: 'What happens under the intestacy rules if someone dies without a valid will?', back: 'A statutory order applies (broadly: spouse/civil partner first, up to a set statutory legacy plus a share, then children, then other relatives) — this may not reflect the deceased\'s actual wishes, and unmarried partners have no automatic entitlement.' },
    { front: 'What is a Lasting Power of Attorney (LPA)?', back: 'A legal document allowing someone (the donor) to appoint one or more attorneys to make decisions on their behalf if they lose mental capacity — covering property & financial affairs and/or health & welfare.' },
    { front: 'What is the difference between the two types of LPA?', back: 'Property & Financial Affairs LPA covers financial decisions (and can be used before loss of capacity, with permission); Health & Welfare LPA covers care and medical decisions, and can only be used once the donor lacks capacity.' },
    { front: 'What is a bare trust?', back: 'A trust where the beneficiary has an absolute, immediate right to both the trust capital and income once they reach age 18 (16 in Scotland) — the simplest trust structure, with the assets treated as belonging to the beneficiary for tax purposes.' },
    { front: 'What is a discretionary trust?', back: 'A trust where trustees have discretion over how and when to distribute income and/or capital among a defined class of beneficiaries — offering flexibility but generally subject to its own IHT charging regime (entry, periodic, and exit charges).' },
    { front: 'What is an interest in possession trust?', back: 'A trust where a named beneficiary (the "life tenant") has an immediate right to the trust income (or use of the asset) for their lifetime or a fixed period, with capital passing to different beneficiaries afterwards.' },
    { front: 'What is the annual gift exemption for inheritance tax?', back: '£3,000 per person per tax year, which can be carried forward one year if unused — gifts within this exemption are immediately outside the estate.' },
    { front: 'What is a Potentially Exempt Transfer (PET)?', back: 'A lifetime gift to an individual that becomes fully exempt from inheritance tax if the donor survives seven years; if they die within seven years, it may become chargeable, with taper relief reducing the tax on gifts made 3–7 years before death.' },
    { front: 'What is taper relief, and what is a common misconception about it?', back: 'It reduces the IHT payable on a PET that becomes chargeable, on a sliding scale from year 3 to year 7 after the gift. It does NOT reduce the value of the gift itself for IHT purposes — only the tax rate applied to that value.' },
    { front: 'What is Business Property Relief (BPR)?', back: 'Relief reducing (often by 100%) the inheritance tax value of qualifying business assets (e.g. shares in a trading company, a sole trader\'s business), provided ownership conditions (typically two years) are met.' },
    { front: 'What is Agricultural Property Relief (APR)?', back: 'Relief reducing (often by 100% or 50%) the inheritance tax value of qualifying agricultural land and property, subject to ownership/occupation conditions.' },
    { front: 'What is "forced heirship," and where is it typically encountered?', back: 'A legal regime in many civil law jurisdictions (e.g. France, much of the Middle East, parts of Europe) that reserves a fixed proportion of an estate for specified heirs (typically children), overriding the deceased\'s freedom to leave assets as they choose in a will.' },
    { front: 'Why does cross-border estate planning need special care for internationally mobile clients?', back: 'Different jurisdictions can apply conflicting succession rules (forced heirship vs testamentary freedom), different tax regimes (domicile, residence, situs of assets), and a will valid in one country may not be recognised or may be overridden in another.' },
    { front: 'What is a Deed of Variation, and what can it achieve?', back: 'A legal document allowing beneficiaries to redirect their inheritance (with agreement) within two years of death, which — if it meets the conditions — is read back for IHT (and CGT) purposes as if the deceased had left it that way originally.' },
    { front: 'What is the "gift with reservation of benefit" rule?', back: 'If a person gives away an asset but continues to benefit from it (e.g. gifting a house but continuing to live in it rent-free), the asset remains in their estate for IHT purposes despite the gift.' },
  ],
}

const EXAMS: { exam: Exam; modules: Record<string, CardSeed[]> }[] = [
  { exam: 'R01', modules: R01_MODULES },
  { exam: 'R06', modules: R06_MODULES },
]

async function main() {
  const db = getDb()
  let totalInserted = 0
  let totalSkipped = 0

  for (const { exam, modules } of EXAMS) {
    for (const [moduleName, cards] of Object.entries(modules)) {
      const existingRows = await db
        .select({ front: study_cards.front })
        .from(study_cards)
        .where(and(eq(study_cards.module, moduleName), eq(study_cards.track, 'qualification'), eq(study_cards.exam, exam)))
      const existingFronts = new Set(existingRows.map(r => r.front))

      const toInsert = cards.filter(c => !existingFronts.has(c.front))
      const skipped = cards.length - toInsert.length

      if (toInsert.length > 0) {
        await addCards(toInsert.map(c => ({ module: moduleName, front: c.front, back: c.back, track: 'qualification', exam })))
      }

      totalInserted += toInsert.length
      totalSkipped += skipped
      console.log(`[${exam}] ${moduleName}: +${toInsert.length} card(s)${skipped > 0 ? `, ${skipped} already present` : ''}`)
    }
  }

  console.log(`\nTotal: ${totalInserted} inserted, ${totalSkipped} skipped.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
