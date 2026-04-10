from langchain_core.prompts import ChatPromptTemplate

EXTRACTION_PROMPT = ChatPromptTemplate.from_template("""
You are an expert in media analysis specialized in extracting verifiable claims from text.
Your task is to extract all CLAIMS from the given text.

A claim is defined as:
- A declarative statement that asserts something about the real world
- It must be possible to verify it as true or false using external evidence
- It must be explicitly stated in the text (do not infer or paraphrase)

Include a statement as a claim ONLY IF:
- It is factual (not an opinion, belief, or speculation)
- It is verifiable (could be checked against data, sources, or evidence)
- It contains at least 2 meaningful words
- It is not a question
- It is not purely subjective language (e.g., "important", "terrible", "good")

Exclude:
- Opinions, judgments, or value statements
- Predictions about the future
- Hypothetical or conditional statements
- Questions
- Vague or incomplete phrases
- Claims that require interpretation beyond what is explicitly written

Special cases:
- If a person or organization states a factual claim, include it ONLY if the statement itself is verifiable
- If the sentence mixes fact and opinion, extract ONLY the factual part if possible

Output rules:
- Extract claims exactly as they appear in the text (no paraphrasing)
- Each claim must be a standalone, complete statement
- Do not add any information that is not present in the snippet

Text:
{text}
""")

NORMALIZATION_PROMPT = ChatPromptTemplate.from_template("""
You are an expert in structuring and normalizing extracted claims.
Your task is to normalize the given list of claims while preserving their original meaning.

Normalization rules:

1. Preserve meaning
- Do NOT change the meaning of any claim
- Do NOT introduce new information
- Avoid paraphrasing unless strictly necessary for splitting

2. Deduplication
- Remove exact duplicates
- If two claims are semantically identical, keep only one
- Do NOT merge different claims into one

3. Splitting compound claims
- If a claim contains multiple independent facts, split it into separate claims
- Each resulting claim must be understandable on its own
- Minimal rewriting is allowed ONLY to make each claim standalone
- Maintain the original wording as much as possible

Example:
"A did X and Y" → "A did X", "A did Y"

4. Cleaning
- Remove incomplete or malformed claims
- Ensure each claim is a complete, standalone statement

5. Output constraints
- Return a list of normalized claims
- Each claim must be a single sentence
- Do NOT include explanations or additional text

Claims:
{raw_claims}
""")

RANKING_PROMPT = ChatPromptTemplate.from_template("""
You are an expert investigative journalist assistant specialized in evaluating claims extracted from news articles.
Your task is to analyze each claim and assign a relevance score (0.0 to 1.0) reflecting how worthy it is of further investigation and research.

Scoring Criteria:
Score each claim higher when it:
- Contains verifiable data — includes specific numbers, statistics, dates, named individuals, or institutions that can be fact-checked
- Has high public impact — affects a significant number of people, involves public funds, health, safety, or civil rights
- Involves accountability — suggests wrongdoing, conflicts of interest, abuse of power, or negligence by a public or influential figure
- Is novel or surprising — contradicts official narratives, established knowledge, or previously reported facts

Score each claim lower when it:
- Is vague, generic, or purely opinion-based with nothing concrete to verify
- Repeats widely known or already-established facts
- Lacks any named actors, figures, or traceable sources

Scoring Scale Reference:
- 0.9 - 1.0 → Explosive: concrete, high-impact, and directly implicates accountability
- 0.6 - 0.8 → Strong: verifiable and newsworthy, but may lack one key element
- 0.3 - 0.5 → Moderate: has some investigable elements but is vague or low-impact
- 0.0 - 0.2 → Weak: generic, opinion-based, or not meaningfully verifiable

Output Format:
Return a JSON array. One object per claim, preserving the original claim text exactly.
Each object must have: "text", "relevance_score", "reason".
The "reason" must be 1-2 sentences referencing the specific elements that drove the score.
Do NOT add commentary outside the JSON array.

Claims to Analyze:
{claims}
""")