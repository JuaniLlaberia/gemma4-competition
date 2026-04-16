import os
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
class Ollama:
    """
    Light wrapper for a `ChatOllama` model instance.
    """
    def __init__(self,
                 temperature: float = 0.05,
                 top_p: float = 0.3,
                 top_k: int = 10,
                 model_name: str = os.getenv("OLLAMA_MODEL", "gemma4:e4b"),
                 base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")) -> None:
        """
        Initializes Ollama class instance.

        Args:
            temperature (float): Controls the randomness of the output.
            top_p (float): Lowering top_p narrows the field of possible tokens.
            top_k (int): Limits the token selection to the top_k most likely tokens at each step.
            model_name (str): Ollama model name. Defaults to OLLAMA_MODEL env var or 'gemma4:e4b'.
            base_url (str): Ollama server URL. Defaults to OLLAMA_BASE_URL env var or localhost.
        """
        self.temperature = temperature
        self.top_p = top_p
        self.top_k = top_k
        self.model_name = model_name
        self.base_url = base_url

        if not self.model_name:
            raise Exception("Failed to initialize Ollama model: Missing model name.")

        self.llm = self._create_model()

    def _create_model(self) -> ChatOllama:
        """
        Initializes and returns a ChatOllama model with customizable generation settings.

        Returns:
            ChatOllama: An instance of the initialized model.
        """
        return ChatOllama(
            model=self.model_name,
            base_url=self.base_url,
            temperature=self.temperature,
            top_p=self.top_p,
            top_k=self.top_k,
        )

    def invoke_model(self,
                     prompt: any,
                     output_schema: BaseModel,
                     input: dict[str, any]) -> any:
        """
        Invoke the configured model chain with structured output.

        Args:
            prompt: A prompt object or prompt string compatible with the langchain prompt operators used here.
            output_schema: A Pydantic `BaseModel` class describing the structured output schema.
            input: A dictionary of inputs to pass to the chain's `invoke` call.
        Returns:
            The raw result returned by the chain.
        Raises:
            Exception: Any unexpected exception raised while invoking the chain.
        """
        structured_llm = self.llm.with_structured_output(output_schema)
        chain = prompt | structured_llm

        try:
            result = chain.invoke(input)
            return result
        except Exception as e:
            return {
                "error": True,
                "error_message": str(e)
            }

    async def ainvoke_model(self,
                            prompt: any,
                            output_schema: BaseModel,
                            input: dict[str, any]) -> any:
        """
        Async invoke the configured model chain with structured output.

        Args:
            prompt: A prompt object or prompt string.
            output_schema: A Pydantic `BaseModel` class describing the structured output schema.
            input: A dictionary of inputs to pass to the chain.
        Returns:
            The raw result returned by the chain.
        """
        structured_llm = self.llm.with_structured_output(output_schema)
        chain = prompt | structured_llm

        try:
            result = await chain.ainvoke(input)
            return result
        except Exception as e:
            return {
                "error": True,
                "error_message": str(e)
            }

    async def aextract_text_from_image(self, b64_image: str) -> str:
        """
        Extracts text from a base64 encoded image using the vision model.

        Args:
            b64_image: Base64 string or data URL (data:<mime>;base64,...) of the image.
        Returns:
            The extracted text, or 'NO_TEXT' if no text is found.
        """
        PROMPT_TEXT = (
            "Extract all the readable text from this image. "
            "Only return the exact text you find in the image, preserving the original structure. "
            "Do not include any preambles, explanations, or markdown blocks. "
            "If there is no text in the image, return exactly the string 'NO_TEXT'."
        )

        if b64_image.startswith("data:"):
            header, _, raw_b64 = b64_image.partition(";base64,")
            mime_type = header[len("data:"):]
        else:
            mime_type = "image/jpeg"
            raw_b64 = b64_image

        message = HumanMessage(
            content=[
                {"type": "text", "text": PROMPT_TEXT},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{raw_b64}"},
                },
            ]
        )
        
        try:
            response = await self.llm.ainvoke([message])
            return response.content.strip()
        except Exception as e:
            print(f"Error extracting text from image: {e}")
            return "NO_TEXT"