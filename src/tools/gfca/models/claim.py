from pydantic import BaseModel

class ClaimReview(BaseModel):
    rating_raw: str
    rating_normalized: str
    reviewer_name: str
    reviewer_site: str
    review_url: str
    review_date: str
    language: str