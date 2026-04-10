from langdetect import detect, LangDetectException

def detect_language(text: str, fallback: str = "en") -> str:
    """
    Detects the language from the given text and it fallbacks to english in case something goes wrong.
    
    Args:
        text (str): Text to detect language.
        fallback (str): Fallback langauge. Default = 'en'.
    Returns:
        str: BCP-47 code — "en", "es", "pt", etc.
    """
    try:
        return detect(text)
    except LangDetectException:
        return fallback