import requests
import os

from src.tools.gfca.models.claim import ClaimReview
from src.tools.gfca.models.result import FactCheckResult

# Note: I (Juan) removed the similarity extra check to not depend on another model (check if we want to include ir or not!)

class GFCAClient:
    """
    Google Fact Check Tools API client.
    """
    BASE_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    _encoder = None

    def __init__(
        self,
        api_key: str = os.getenv("GFCA_API_KEY"),
    ):
        """
        Args:
            api_key: Google Fact Check Tools API key.
        """
        self.api_key = api_key
        if not self.api_key:
            raise ValueError(
                "No API key provided."
            )

    def _fetch_gfca(
        self,
        query: str,
        language_code: str,
        max_age_days: int,
        page_size: int,
        publisher_filter: str | None) -> dict:
        """
        Raw HTTP call to the GFCA REST endpoint.
        
        Args:
            query: The claim text to search for.
            language_code: BCP-47 code — "en", "es", "pt", etc.
            max_age_days: How far back to look. Default 3 years.
            page_size: Max raw results to fetch from GFCA before filtering.
            publisher_filter: Pin to a specific fact-checker site.
        Returns:
            Response: Google Fact Check API response.
        """
        params = {
            "query": query,
            "languageCode": language_code,
            "maxAgeDays": max_age_days,
            "pageSize": page_size,
            "key": self.api_key,
        }
        if publisher_filter:
            params["reviewPublisherSiteFilter"] = publisher_filter

        response = requests.get(self.BASE_URL, params=params)
        response.raise_for_status()

        return response.json()

    def _parse_results(self, raw: dict) -> list[FactCheckResult]:
        """
        Convert raw GFCA response into FactCheckResult objects.
        
        Args:
            raw (dict): Raw response from GFCA.
        Returns:
            list[FactCheckResult]: List of formatted fact check results.
        """
        results = []
        for claim in raw.get("claims", []):
            reviews = [
                ClaimReview(
                    rating_raw=r.get("textualRating", ""),
                    rating_normalized=self._normalize_rating(r.get("textualRating", "")),
                    reviewer_name=r.get("publisher", {}).get("name", ""),
                    reviewer_site=r.get("publisher", {}).get("site", ""),
                    review_url=r.get("url", ""),
                    review_date=r.get("reviewDate", ""),
                    language=r.get("languageCode", ""),
                )
                for r in claim.get("claimReview", [])
            ]

            results.append(FactCheckResult(
                claim_text=claim.get("text", ""),
                claimant=claim.get("claimant", "Unknown"),
                claim_date=claim.get("claimDate", ""),
                similarity_score=0.0,
                reviews=reviews,
            ))

        return results

    def _deduplicate_facts(self, results: list[FactCheckResult]) -> list[FactCheckResult]:
        """
        Deduplicate by review URL so a single article with multiple claims doesn't inflate the evidence pool.

        Args:
            results (list[FactCheckResults]): List of facts containing all of it's data.
        Returns:
            list[FactCheckResult]: Deduped list of facts.
        """
        seen_urls: set[str] = set()

        deduped = []
        for result in results:
            unique_reviews = []

            for review in result.reviews:
                if review.review_url not in seen_urls:
                    seen_urls.add(review.review_url)
                    unique_reviews.append(review)

            if unique_reviews:
                result.reviews = unique_reviews
                deduped.append(result)

        return deduped
    
    def search(
        self,
        query: str,
        language_code: str = "en",
        max_age_days: int = 365 * 3,
        page_size: int = 15,
        publisher_filter: str = None) -> list[FactCheckResult]:
        """
        Search GFCA for fact-checked claims matching `query`.

        Args:
            query: The claim text to search for.
            language_code: BCP-47 code — "en", "es", "pt", etc.
            max_age_days: How far back to look. Default 3 years.
            page_size: Max raw results to fetch from GFCA before filtering.
            publisher_filter: Pin to a specific fact-checker site.

        Returns:
            Filtered, deduplicated list of FactCheckResult.
        """
        raw_results = self._fetch_gfca(query, language_code, max_age_days, page_size, publisher_filter)
        parsed = self._parse_results(raw=raw_results)
        deduped = self._deduplicate_facts(results=parsed)

        return deduped