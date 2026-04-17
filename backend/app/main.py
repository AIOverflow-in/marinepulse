from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import auth, companies, vessels, checklists, inspection_requests, inspections, analytics, chat, users, passage_plans, criteria_sets, vessel_logs


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="MarinePulse API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(vessels.router)
app.include_router(checklists.router)
app.include_router(inspection_requests.router)
app.include_router(inspections.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(users.router)
app.include_router(passage_plans.router)
app.include_router(criteria_sets.router)
app.include_router(vessel_logs.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "MarinePulse API"}
