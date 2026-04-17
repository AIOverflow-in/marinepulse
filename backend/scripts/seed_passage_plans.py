"""
Seed script — generates 8 realistic passage plan analyses directly in MongoDB.
No PDF upload or OpenAI API call needed; inserts CriterionResult data directly.

Run: cd backend && source venv/bin/activate && python scripts/seed_passage_plans.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie, PydanticObjectId

from app.models.passage_plan_analysis import PassagePlanAnalysis, CriterionResult
from app.models.criteria_set import CriteriaSet
from app.models.user import User
from app.services.passage_plan_analyzer import CRITERIA, CATEGORY_NAMES, compute_summary

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/marinepulse")

# ── SIRE-style observations / risks / refs for each criterion category ─────────

def _gap(criterion_id: str, label: str, priority: str) -> tuple:
    """Return (observation, risk, reference) for a missing criterion."""
    obs_map = {
        "A6":  ("The passage plan does not reference the ENCs or paper charts to be used for the voyage.",
                "Navigating without confirmed chart availability increases the risk of using outdated or unsuitable charts.",
                "ICS Bridge Procedures Guide Sec 3.1; SIRE 2.0 VIQ 6.1"),
        "A7":  ("No confirmation that charts or ENCs have been updated with the latest T&P Notices.",
                "Uncharted hazards or temporary dangers may not be reflected on the navigational display.",
                "SOLAS V/27; SIRE 2.0 VIQ 6.1.2"),
        "A8":  ("Relevant nautical publications (Sailing Directions, List of Lights) are not listed in the plan.",
                "Bridge team may lack access to essential port entry and navigational reference information.",
                "SOLAS V/27; ICS Bridge Procedures Guide Sec 2.4"),
        "A11": ("No evidence that NAVTEX or NAVAREA warnings were reviewed prior to departure.",
                "Active navigational warnings affecting the route may not be known to the bridge team.",
                "SIRE 2.0 VIQ 6.2; SOLAS V/26"),
        "A12": ("Weather forecast consideration is not documented in the passage plan.",
                "Adverse weather may be encountered without prior preparation, compromising vessel safety.",
                "SIRE 2.0 VIQ 6.2.3; ISM Code 10.2"),
        "B6":  ("No-go areas are not marked on the ECDIS or referenced in the passage plan.",
                "Without defined no-go areas the vessel may inadvertently navigate into shallow or restricted water.",
                "SIRE 2.0 VIQ 6.4.2; ICS Bridge Procedures Guide Sec 4.3"),
        "B7":  ("Danger points along the route are not identified or highlighted.",
                "Critical hazards may not receive increased navigational attention from the watchkeeper.",
                "SIRE 2.0 VIQ 6.4.3; ICS Bridge Procedures Guide Sec 4.2"),
        "B9":  ("Tidal and current affected areas are not marked or annotated in the plan.",
                "Set and drift may cause the vessel to deviate from the planned track without warning.",
                "SIRE 2.0 VIQ 6.4.5; ICS Bridge Procedures Guide Sec 5.2"),
        "C1":  ("The plan does not specify the primary position fixing method to be used for each leg.",
                "Inconsistent or inappropriate fixing methods may lead to positional errors going undetected.",
                "SIRE 2.0 VIQ 6.5.1; STCW Reg. VIII/2"),
        "C3":  ("Position fixing intervals are not defined in the passage plan.",
                "Infrequent fixing in confined or high-traffic waters increases grounding and collision risk.",
                "SIRE 2.0 VIQ 6.5.2; ISM Code 10.3"),
        "C4":  ("Cross-track error (XTE) limits are not specified for the passage legs.",
                "Excessive deviation from the planned track may go unnoticed until the vessel is in danger.",
                "SIRE 2.0 VIQ 6.5.3; ICS Bridge Procedures Guide Sec 5.3"),
        "C5":  ("Parallel indexing is not planned for confined or high-risk navigational areas.",
                "Without parallel indexing, off-track situations in high-risk areas may not be detected promptly.",
                "SIRE 2.0 VIQ 6.5.4; ICS Bridge Procedures Guide Sec 5.4"),
        "C7":  ("Master's call criteria are not defined in the passage plan.",
                "The OOW may not summon the Master in time during a developing navigational emergency.",
                "SIRE 2.0 VIQ 5.2; ISM Code 8.2"),
        "D1":  ("No UKC calculation sheet is included or referenced in the passage plan.",
                "Without a verified UKC calculation the vessel may transit with inadequate underkeel clearance.",
                "SIRE 2.0 VIQ 6.3.1; Malacca & Singapore Straits Regulations"),
        "D2":  ("Dynamic UKC (squat, heel, pitch/roll effects) has not been considered.",
                "Static draft figures alone may underestimate the true dynamic draft, risking a seabed contact.",
                "SIRE 2.0 VIQ 6.3.2; ICS Bridge Procedures Guide Sec 6.1"),
        "D3":  ("Squat effect is not accounted for in the UKC calculation.",
                "At transit speed, squat significantly reduces effective underkeel clearance, increasing grounding risk.",
                "SIRE 2.0 VIQ 6.3.2; ICORELS formula reference"),
        "D4":  ("Tidal height variations are not incorporated into the UKC calculation.",
                "Transiting during low water without tidal allowance may result in the vessel touching bottom.",
                "SIRE 2.0 VIQ 6.3.3; ICS Bridge Procedures Guide Sec 6.2"),
        "D5":  ("The plan does not confirm that UKC meets the company's minimum policy requirement.",
                "Non-compliant UKC may go undetected, exposing the vessel to regulatory and grounding risk.",
                "SIRE 2.0 VIQ 6.3.1; Company SMS UKC Policy"),
        "D6":  ("Overhead clearance under bridges and cables is not calculated.",
                "Air draft exceedance under a structure could cause serious structural damage.",
                "SIRE 2.0 VIQ 6.3.4; IALA Port Entry Guide"),
        "E1":  ("No steering failure contingency is documented in the passage plan.",
                "In the event of a steering failure in confined waters the crew will lack immediate action guidance.",
                "SIRE 2.0 VIQ 6.6.1; ISM Code 8.1; SOLAS V/34"),
        "E2":  ("Engine failure contingency procedures are not referenced or included.",
                "A main engine failure without a pre-planned response risks grounding or collision.",
                "SIRE 2.0 VIQ 6.6.2; ISM Code 8.1; SOLAS V/34"),
        "E3":  ("Blackout / total power failure contingency is not addressed.",
                "Complete loss of power in congested or shallow waters without a pre-planned response could be catastrophic.",
                "SIRE 2.0 VIQ 6.6.3; ISM Code 8.1; SOLAS II-1/26"),
        "E4":  ("Abort points are not defined along the passage.",
                "Without defined abort points the Master cannot make a timely decision to abort the passage.",
                "SIRE 2.0 VIQ 6.6.4; ICS Bridge Procedures Guide Sec 7.1"),
        "E5":  ("Points of no return are not defined, particularly for pilotage areas.",
                "Continuing past a point of no return without awareness may leave no safe alternative action.",
                "SIRE 2.0 VIQ 6.6.5; ICS Bridge Procedures Guide Sec 7.2"),
        "E6":  ("Emergency anchorage positions are not identified in the passage plan.",
                "Without pre-identified emergency anchorages, finding a suitable position under time pressure is hazardous.",
                "SIRE 2.0 VIQ 6.6.6; ICS Bridge Procedures Guide Sec 7.3"),
        "E7":  ("Places of refuge are not identified along the route.",
                "Without identified refuges, response to an emergency that requires shelter is delayed.",
                "SIRE 2.0 VIQ 6.6.7; IMO MSC-Circ.1033"),
        "F1":  ("VTS reporting points are not identified in the passage plan.",
                "Failure to report to VTS may result in non-compliance with local regulations and port state control.",
                "SIRE 2.0 VIQ 6.7.1; SOLAS V/12"),
        "F3":  ("Mandatory ship reporting systems (JASREP, AMVER, etc.) are not included in the plan.",
                "Non-participation in mandatory reporting systems violates flag state and coastal state requirements.",
                "SIRE 2.0 VIQ 6.7.3; SOLAS V/11"),
        "G6":  ("The plan does not indicate whether it has been updated to reflect changes since preparation.",
                "Operating on an outdated plan may expose the vessel to hazards that have arisen after plan approval.",
                "SIRE 2.0 VIQ 6.8.6; ISM Code 10.1"),
        "H1":  ("Risks are not explicitly stated in the passage plan narrative.",
                "Bridge team may not be aware of voyage-specific safety risks during plan briefing.",
                "SIRE 2.0 VIQ 6.9.1; ISM Code 10.1"),
        "H3":  ("The plan contains generic instructions rather than voyage-specific guidance.",
                "Generic planning reduces situational awareness and bridge team preparedness for this specific voyage.",
                "SIRE 2.0 VIQ 6.9.3; ISM Code 10.2"),
        "H5":  ("Monitoring instructions in the plan are not specific to the navigational conditions of this voyage.",
                "Vague monitoring guidance reduces the OOW's ability to detect developing hazards promptly.",
                "SIRE 2.0 VIQ 6.9.5; STCW Reg. VIII/2"),
        "H6":  ("Human factors and fatigue management are not addressed in the passage plan.",
                "Failure to consider watchkeeping limitations and fatigue increases error risk during critical legs.",
                "SIRE 2.0 VIQ 6.9.6; STCW Reg. VIII/1; MLC 2006"),
    }
    default_obs = (
        f"The passage plan does not provide evidence that '{label}' has been addressed.",
        f"Absence of this element may compromise navigational safety during the voyage.",
        "SIRE 2.0 VIQ Chapter 6; ICS Bridge Procedures Guide",
    )
    entry = obs_map.get(criterion_id, default_obs)
    return entry


def _build_results(missing_ids: set) -> list[CriterionResult]:
    """Build a full 80-criterion result list with the given IDs marked as missing."""
    results = []
    for c in CRITERIA:
        if c["id"] in missing_ids:
            obs, risk, ref = _gap(c["id"], c["label"], c["priority"])
            results.append(CriterionResult(
                id=c["id"], present=0, confidence="high",
                observation=obs, risk=risk, reference=ref,
            ))
        else:
            results.append(CriterionResult(
                id=c["id"], present=1, confidence="high",
            ))
    return results


# ── 8 synthetic passage plans ──────────────────────────────────────────────────
# Each entry: (vessel_name, voyage_no, from_port, to_port, days_ago, missing_ids)

PLANS = [
    # 1 — Near-perfect plan
    {
        "vessel_name": "MV Nordic Star",
        "voyage_number": "23A",
        "from_port": "Rotterdam, Netherlands",
        "to_port": "Singapore",
        "days_ago": 45,
        "filename": "NordicStar_23A_PP.pdf",
        "missing": {"H5", "H6", "G6"},   # minor quality gaps only
    },
    # 2 — Good plan, some planning gaps
    {
        "vessel_name": "MV Baltic Trader",
        "voyage_number": "07B",
        "from_port": "Daesan, South Korea",
        "to_port": "Busan, South Korea",
        "days_ago": 30,
        "filename": "BalticTrader_07B_PP.pdf",
        "missing": {"B13", "B14", "B15", "E4", "E5", "H1", "H3", "H6"},
    },
    # 3 — Medium plan, missing critical no-go areas
    {
        "vessel_name": "MV Pacific Queen",
        "voyage_number": "15C",
        "from_port": "Singapore",
        "to_port": "Hong Kong",
        "days_ago": 22,
        "filename": "PacificQueen_15C_PP.pdf",
        "missing": {
            "B6",                               # CRITICAL: no-go areas
            "B11", "B12", "B13", "B14", "B15",  # environmental planning
            "C6", "C7", "C8",                   # execution procedures
            "E4", "E5", "E6", "E7",             # contingency
            "F3", "F4",                         # reporting
            "H1", "H2", "H3", "H5", "H6",      # quality
        },
    },
    # 4 — Poor plan, critical UKC and contingency gaps
    {
        "vessel_name": "MV Horizon Star",
        "voyage_number": "31D",
        "from_port": "Manila, Philippines",
        "to_port": "Osaka, Japan",
        "days_ago": 15,
        "filename": "HorizonStar_31D_PP.pdf",
        "missing": {
            "D1", "D2", "D3", "D4", "D5",      # CRITICAL: full UKC missing
            "E1", "E2", "E3",                   # CRITICAL: contingency
            "E4", "E5", "E6", "E7",
            "B6", "B7", "B9",
            "C3", "C4", "C5", "C7",
            "F1", "F3",
            "H1", "H3", "H5", "H6",
        },
    },
    # 5 — Good plan, long ocean passage
    {
        "vessel_name": "MV Caspian Wind",
        "voyage_number": "44E",
        "from_port": "Fujairah, UAE",
        "to_port": "Rotterdam, Netherlands",
        "days_ago": 60,
        "filename": "CaspianWind_44E_PP.pdf",
        "missing": {"B13", "E4", "E5", "F3", "H1", "H5", "H6"},
    },
    # 6 — Medium plan, reporting and quality weak
    {
        "vessel_name": "MV Atlantic Spirit",
        "voyage_number": "02F",
        "from_port": "Santos, Brazil",
        "to_port": "Cape Town, South Africa",
        "days_ago": 10,
        "filename": "AtlanticSpirit_02F_PP.pdf",
        "missing": {
            "B9", "B11", "B12",
            "C7", "C8",
            "E4", "E5", "E6",
            "F1", "F3", "F4",
            "H1", "H2", "H3", "H5", "H6",
            "G6",
        },
    },
    # 7 — Excellent plan, transatlantic
    {
        "vessel_name": "MV Nordic Queen",
        "voyage_number": "18G",
        "from_port": "Hamburg, Germany",
        "to_port": "New York, USA",
        "days_ago": 90,
        "filename": "NordicQueen_18G_PP.pdf",
        "missing": {"B14", "H6"},
    },
    # 8 — Very poor plan, multiple critical gaps
    {
        "vessel_name": "MV Star Voyager",
        "voyage_number": "55H",
        "from_port": "Tianjin, China",
        "to_port": "Jakarta, Indonesia",
        "days_ago": 5,
        "filename": "StarVoyager_55H_PP.pdf",
        "missing": {
            "A6", "A7", "A8", "A11", "A12",     # no appraisal
            "B6", "B7", "B9",                   # CRITICAL: no-go areas
            "C1", "C3", "C4", "C5", "C7",
            "D1", "D2", "D3", "D4", "D5",       # CRITICAL: no UKC
            "E1", "E2", "E3",                   # CRITICAL: no contingency
            "E4", "E5", "E6", "E7",
            "F1", "F3",
            "H1", "H2", "H3", "H5", "H6",
        },
    },
]


async def seed_passage_plans():
    if MONGODB_URI.startswith("mongodb+srv"):
        try:
            import certifi
            client = AsyncIOMotorClient(MONGODB_URI, tlsCAFile=certifi.where())
        except Exception:
            client = AsyncIOMotorClient(MONGODB_URI)
    else:
        client = AsyncIOMotorClient(MONGODB_URI)
    db_name = MONGODB_URI.split("/")[-1].split("?")[0]
    await init_beanie(
        database=client[db_name],
        document_models=[PassagePlanAnalysis, CriteriaSet, User],
    )

    # Get company_id + uploader from first admin user
    admin = await User.find_one({"role": "consultancy_admin"})
    if not admin:
        print("❌  No admin user found — run seed.py first")
        return

    company_id = admin.company_id or admin.id

    # Get default criteria set id
    default_cs = await CriteriaSet.find_one({"is_default": True})
    cs_id = default_cs.id if default_cs else None

    # Clear existing analyses
    await PassagePlanAnalysis.delete_all()
    print("Cleared existing passage plan analyses.")

    now = datetime.utcnow()

    for i, p in enumerate(PLANS, 1):
        missing = p["missing"]
        results = _build_results(missing)
        summary = compute_summary(results)

        analysis = PassagePlanAnalysis(
            vessel_name=p["vessel_name"],
            voyage_number=p["voyage_number"],
            from_port=p["from_port"],
            to_port=p["to_port"],
            voyage_date=now - timedelta(days=p["days_ago"] + 2),
            company_id=company_id,
            uploaded_by=admin.id,
            criteria_set_id=cs_id,
            filename=p["filename"],
            gridfs_id=None,
            status="complete",
            results=results,
            overall_score=summary["overall_score"],
            total_criteria=summary["total_criteria"],
            criteria_met=summary["criteria_met"],
            critical_gaps=summary["critical_gaps"],
            created_at=now - timedelta(days=p["days_ago"]),
        )
        await analysis.insert()

        crit = summary["critical_gaps"]
        grade = (
            "A" if summary["overall_score"] >= 80 else
            "B" if summary["overall_score"] >= 65 else
            "C" if summary["overall_score"] >= 50 else
            "D" if summary["overall_score"] >= 35 else "F"
        )
        print(
            f"  [{i}] {p['vessel_name']:25s} {p['from_port'][:15]:15s} → {p['to_port'][:15]:15s}"
            f"  Score={summary['overall_score']:5.1f}% ({grade})  "
            f"Met={summary['criteria_met']:2d}/80  Critical gaps={crit}"
        )

    print(f"\n✅  Seeded {len(PLANS)} passage plan analyses.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_passage_plans())
