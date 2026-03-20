from fastapi import FastAPI
from pydantic import BaseModel
import os
import httpx
from openai import OpenAI
import google.generativeai as genai
import requests
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from app.ai.embeddings import get_embedding
import uuid

from tools.script_executor import execute_script

app = FastAPI(title="Agent Orchestrator")

# =============================
# ENV CONFIG
# =============================

LLM_PROVIDER = os.getenv("DEFAULT_LLM", "ollama")
LLM_BASE_URL = os.getenv("LLM_BASE_URL")
LLM_MODEL = os.getenv("LLM_MODEL")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# =============================
# QDRANT MEMORY
# =============================

QDRANT_URL = os.getenv("QDRANT_URL")

qdrant = QdrantClient(url=QDRANT_URL)

MEMORY_COLLECTION = "agent_memory"

# =============================
# REQUEST MODELS
# =============================

class ChatRequest(BaseModel):
    message: str
    provider: str | None = None

# =============================
# MEMORY SAVE FUNCTION
# =============================

def save_memory(text: str):

    try:

        print("MEMORY SAVE:", text)

        embedding = get_embedding(text)

        print("EMBEDDING SIZE:", len(embedding))
        print("EMBEDDING SAMPLE:", embedding[:5])

        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={"text": text}
        )

        qdrant.upsert(
            collection_name=MEMORY_COLLECTION,
            points=[point]
        )

        print("MEMORY SAVED OK")

    except Exception as e:
        print("MEMORY ERROR:", e)

# =============================
# MEMORY SEARCH FUNCTION
# =============================

def search_memory(query: str, limit: int = 3):

    try:

        query_vector = get_embedding(query)

        results = qdrant.search(
            collection_name=MEMORY_COLLECTION,
            query_vector=query_vector,
            limit=limit,
            with_payload=True
        )

        memories = []

        for r in results:
            memories.append({
                "score": r.score,
                "text": r.payload.get("text", "")
            })

        return memories

    except Exception as e:

        print("MEMORY SEARCH ERROR:", e)
        return []

# =============================
# HEALTH CHECK
# =============================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "default_llm": LLM_PROVIDER
    }

# =============================
# CHAT ENDPOINT
# =============================

@app.post("/chat")
async def chat(req: ChatRequest):

    provider = req.provider or LLM_PROVIDER

    if provider == "ollama":

        # recupera memorie simili
        memories = search_memory(req.message)

        memory_text = "\n".join(
            [f"- {m['text']}" for m in memories if m["score"] > 0]
        )

        prompt = f"""
You are the official digital assistant of PHONESIA.

PHONESIA is a telecom and smartphone store chain in Sicily with shops in:
Floridia, Augusta, Siracusa and Avola.

Customers contact PHONESIA mainly for:

• smartphone offers
• mobile phone plans
• fiber internet for home
• smartphone accessories
• operator assistance
• services for citizens (SPID, payments, etc.)
• insurance services

Your role is to help customers like a real store assistant.

Important rules:

- Always answer in Italian.
- Be clear and short.
- Never invent promotions or prices.
- If the customer asks about offers, explain that offers vary and invite them to the store.
- Never repeat the customer's question.
- Never invent stories or irrelevant details.

Example style:

Customer: Avete offerte smartphone?

Answer example:
"Certo! In negozio abbiamo diverse offerte su smartphone Samsung, iPhone e altri modelli.

Le promozioni cambiano spesso in base agli operatori e alle disponibilità.

Se vuoi possiamo consigliarti il modello migliore per le tue esigenze.

Puoi passare in negozio a Floridia, Augusta, Siracusa o Avola e vediamo insieme le offerte attive."

Context from previous conversations:
{memory_text}

Customer question:
{req.message}
"""

        print("PROMPT SENT TO LLM:\n", prompt)

        payload = {
            "model": LLM_MODEL,
            "prompt": prompt,
            "stream": False
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{LLM_BASE_URL}/api/generate",
                json=payload
            )

        result = response.json()

        if not req.message.endswith("?"):
            save_memory(req.message)

        ai_response = result.get("response", "")
        save_memory(f"AI: {ai_response}")

        return result

    elif provider == "openai":

        if not OPENAI_API_KEY:
            return {"error": "OPENAI_API_KEY missing"}

        client = OpenAI(api_key=OPENAI_API_KEY)

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": req.message}],
        )

        return {"response": completion.choices[0].message.content}

    elif provider == "gemini":

        if not GEMINI_API_KEY:
            return {"error": "GEMINI_API_KEY missing"}

        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(req.message)

        return {"response": response.text}

    else:
        return {"error": "Unknown provider"}

# =============================
# SCRIPT EXECUTION TOOL
# =============================

@app.post("/execute")
def execute(command: str):
    return execute_script(command)
