from langchain_core.prompts import ChatPromptTemplate

EXTRACTION_PROMPT = ChatPromptTemplate.from_template("""
You are an expert in media analysis specialized in extracting verifiable claims from text.
The user interacting with you is acting as a {role}.
Your task is to extract all CLAIMS from the given text, taking into account their perspective.

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
