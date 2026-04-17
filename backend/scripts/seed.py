"""
Seed script for MarinePulse POC.
Generates realistic 18-month inspection dataset for 6 vessels using Yatendra's
121-item navigational audit checklist (0-5 + NS scoring).

Run: cd backend && source venv/bin/activate && python scripts/seed.py
"""
import asyncio
import sys
import os
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.models.company import Company
from app.models.user import User, UserRole
from app.models.vessel import Vessel, VesselType, VesselStatus
from app.models.inspection_request import InspectionRequest, InspectionType, RequestStatus, Priority
from app.models.checklist_template import ChecklistTemplate
from app.models.checklist_item import ChecklistItem
from app.models.inspection import Inspection, InspectionStatus, VHIGrade
from app.models.inspection_score import InspectionScore
from app.models.criteria_set import CriteriaSet, Criterion
from app.services.auth_service import hash_password
from app.services.vhi import compute_audit_score, grade_from_vhi
from app.services.passage_plan_analyzer import CRITERIA


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/marinepulse")

# ── 121-item navigational audit checklist (Yatendra/Nivyash Marine) ───────────
# Score: 0-5 (0=Hazard, 1=Non-existent, 2=Poor, 3=Fair, 4=Good, 5=Excellent)
# NS = Not Sighted (excluded from calculations)
CHECKLIST_ITEMS = [
    # ── STATIC ASSESSMENT ──────────────────────────────────────────────────────

    # Company Policy (15 items)
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-001",
     "item_name": "Does the company have robust and detailed navigational policies and procedures?",
     "guidance_note": "If SMS available in electronic format, back up available in wheel house."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-002",
     "item_name": "Have all non-conformity from earlier assessments been closed out effectively?",
     "guidance_note": "Last Nav audit findings — check recurring items e.g. weather reports not signed by watchkeepers."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-003",
     "item_name": "Does the company have thorough procedures for using ECDIS and does the bridge team fully understand their application?",
     "guidance_note": "ENC used on overscale. Check if bridge team understands ECDIS procedures."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-004",
     "item_name": "Are the arrangements for standby conditions been discussed and documented as per company requirements?",
     "guidance_note": "Pre port meeting log includes arrangement for standby conditions."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-005",
     "item_name": "Does the bridge team fully understand the company UKC and air draft policy, its requirements and application?",
     "guidance_note": None},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-006",
     "item_name": "Are all the deck officers aware of the requirements of the company restricted visibility policy?",
     "guidance_note": None},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-007",
     "item_name": "Are essential/critical systems tests being carried out as per company requirements?",
     "guidance_note": "Test of critical and essential systems — Main engine, steering — recorded in logs in region where tests will not endanger own vessel."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-008",
     "item_name": "Are the requirements of the company anchoring procedures understood?",
     "guidance_note": "Anchoring requirements: Swing circle marking, approach, noting position and bearing when let go."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-009",
     "item_name": "Do the Master's standing orders incorporate and comply with the minimum company requirements, and are they appropriate?",
     "guidance_note": "Masters Standing Orders:\n1. Signed by all watchkeepers and lookouts.\n2. Includes instructions when vessel temporarily outside XTD."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-010",
     "item_name": "Are the company requirements regarding bridge orders being complied with?",
     "guidance_note": "Bridge Order Book:\n1. Every night when vessel at sea.\n2. Hand written.\n3. Signed by OOW."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-011",
     "item_name": "Is the working language used on board as per company requirements?",
     "guidance_note": None},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-012",
     "item_name": "Are bridge manning levels being maintained as per company requirements?",
     "guidance_note": "Bridge Manning level should cover all aspects of voyage:\n1. Day, Night, Coastal, Manoeuvering, Stand By, Pilotage etc."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-013",
     "item_name": "Is the deck logbook/bell book being maintained as per company requirements?",
     "guidance_note": "Deck Log Book:\n1. Log of all activities in detail enough to restore complete record of voyage.\n2. Record of review of Passage plan by Master and Bridge team.\n3. Log of change over from auto to manual and vice versa.\n4. Operational functional check of VDR in deck log book.\n5. Log of safety rounds."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-014",
     "item_name": "Are familiarisation and training records available and is training actively promoted on board?",
     "guidance_note": "Familiarisation record should include:\n1. Familiarisation of Watchkeeping officers, Helmsman with aspects of their responsibility including Radar, ECDIS, GMDSS."},
    {"category": "Company Policy", "assessment_type": "static", "item_code": "SCP-015",
     "item_name": "Do officers and the Master write formal handover notes and is the status of bridge equipment sufficiently detailed?",
     "guidance_note": None},

    # Passage Planning (10 items)
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-001",
     "item_name": "Has a robust passage plan for the current voyage been prepared?",
     "guidance_note": "Berth to Berth signed by Bridge team and Master."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-002",
     "item_name": "Has a robust passage plan been prepared on ECDIS and have safety contours and safety depths been correctly set?",
     "guidance_note": "Safety depth and Safety Contours for all stages of voyage marked on ECDIS. When Route crosses Safety contour:\n1. Mandatory to mark manual NO GO AREA.\n2. Authorisation from Master.\n3. When CATZOC C,D,U increase safety depth more than dynamic UKC.\n4. XTD considering dangers in vicinity for each leg of voyage."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-003",
     "item_name": "Are all charts properly corrected and up to date?",
     "guidance_note": None},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-004",
     "item_name": "Is the chart management system being maintained as per company requirements?",
     "guidance_note": "ENC on board and updated."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-005",
     "item_name": "Are all relevant nautical publications up to date and readily available to the bridge team?",
     "guidance_note": "Publications on board and updated."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-006",
     "item_name": "Have navigation warnings and T&Ps been applied to the charts for the current voyage?",
     "guidance_note": "Nav Warnings and Navtex:\n1. Signed by all duty officers.\n2. Update as Manual update list on ECDIS."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-007",
     "item_name": "Is the passage plan reviewed prior to departure by the Master and the bridge team?",
     "guidance_note": "Passage plan signed by Master and Nav Officers. Records of reviews should be made in the deck logbook/bell book."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-008",
     "item_name": "Is the passage debriefed on completion of a voyage?",
     "guidance_note": "Record of debrief of passage plans in deck log book and bell book."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-009",
     "item_name": "Is a toolbox talk held prior to entering confined waters or a standby condition?",
     "guidance_note": "Record of tool box talk of Bridge team prior entering confined waters in Deck Log book and Bell book."},
    {"category": "Passage Planning", "assessment_type": "static", "item_code": "SPP-010",
     "item_name": "Is there evidence of position fixing being carried out as per company requirements for the entire voyage?",
     "guidance_note": "Position fixing intervals and methods identified. Intervals commensurate and practical to ensure vessel cannot run into danger between fixes."},

    # Bridge Equipment (29 items)
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-001",
     "item_name": "Is all navigational and communication equipment fully operational?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-002",
     "item_name": "Has the emergency steering gear been tested as per Flag State and company requirements?",
     "guidance_note": "Log of steering test prior arrival."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-003",
     "item_name": "Is manual steering used as per company requirements?",
     "guidance_note": "Manual steering should be engaged when navigating in restricted waters, in areas of high traffic density and in all other hazardous navigational situations. Use logged."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-004",
     "item_name": "Are gyro compass(es) and repeaters aligned and properly maintained?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-005",
     "item_name": "Is the magnetic compass in good condition and are deviations broadly aligned with the deviation card?",
     "guidance_note": "Record of Compass error and deviations."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-006",
     "item_name": "Are radars and ARPA fully operational and properly maintained?",
     "guidance_note": "Check STW settings and alarms."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-007",
     "item_name": "Is the Automatic Identification System operational and properly set up?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-008",
     "item_name": "Is the GPS properly set up, fully operational and being used as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-009",
     "item_name": "Is the echo sounder fully operational and used as per company requirements?",
     "guidance_note": "Echo Sounder use:\n1. Echo sounder performance prior using to verify recorded depths. Log.\n2. Alarms if any adequate.\n3. Date/Time marked, cross referencing."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-010",
     "item_name": "Is NAVTEX correctly programmed and are messages being managed correctly?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-011",
     "item_name": "Is the ECDIS type-approved, are ENCs fully up to date and is the ECDIS set up as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-012",
     "item_name": "Is ECDIS software maintained and updated to the relevant IHO standards?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-013",
     "item_name": "Are Very High Frequency radios fully operable and is communications protocol thoroughly understood?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-014",
     "item_name": "Is the daylight signalling lamp able to operate on a secondary source of power?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-015",
     "item_name": "Is the off-course alarm properly set up and in use?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-016",
     "item_name": "Are rudder angle, RPM, variable pitch, rate of turn and bow/stern thruster indicators all in good working order?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-017",
     "item_name": "Are the vessel's shapes, whistle, bell and gong in good order?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-018",
     "item_name": "Is the autopilot in good order?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-019",
     "item_name": "Are all internal communication systems in good order?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-020",
     "item_name": "Is the speed and distance measuring device fully operational?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-021",
     "item_name": "Is the VDR fully operational and used as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-022",
     "item_name": "Is the course recorder being maintained as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-023",
     "item_name": "Are navigation lights in good order?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-024",
     "item_name": "Is the weather fax or an equivalent digital programme fully operational?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-025",
     "item_name": "Are the vessel's manoeuvring characteristics displayed on the bridge?",
     "guidance_note": "Wheel house poster and manoeuvring characteristics aligned with Pilot Card."},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-026",
     "item_name": "Is the engine data logger maintained as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-027",
     "item_name": "Is the Long Range Identification and Tracking system being maintained as per company requirements?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-028",
     "item_name": "Is the GMDSS equipment kept in good working order and are officers fully familiar with its use?",
     "guidance_note": None},
    {"category": "Bridge Equipment", "assessment_type": "static", "item_code": "SBE-029",
     "item_name": "Is the Bridge Navigational Watch Alarm System fully operational at all times when the vessel is not alongside?",
     "guidance_note": None},

    # Forms and Checklists (7 items)
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-001",
     "item_name": "Has a pre-arrival exchange of information between the ship and port authority been conducted?",
     "guidance_note": "Pre arrival exchange with port authority satisfactory."},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-002",
     "item_name": "Has the Master/Pilot information exchange form been fully completed?",
     "guidance_note": "MPEX:\n1. Details including weather completed in entirety, no blanks, mark NA. Including Air Draft."},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-003",
     "item_name": "Is the UKC being calculated correctly?",
     "guidance_note": "UKC calculation correct and complete. CATZOC, shallow water contours checked."},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-004",
     "item_name": "Are checklists for pre-arrival, pre-departure, watch handover, steering gear tests, Master/Pilot exchange and Pilot card effectively completed?",
     "guidance_note": "All checklists complete and signed off correctly."},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-005",
     "item_name": "Are periodic checks on navigational equipment being conducted as per company requirements?",
     "guidance_note": None},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-006",
     "item_name": "Are all other navigational checklists completed and signed off correctly?",
     "guidance_note": None},
    {"category": "Forms and Checklists", "assessment_type": "static", "item_code": "SFC-007",
     "item_name": "Are bridge checklists, logbooks and the printouts from digital equipment being retained as per company requirements?",
     "guidance_note": None},

    # ── DYNAMIC ASSESSMENT ─────────────────────────────────────────────────────

    # Company Policy — Dynamic (5 items)
    {"category": "Company Policy", "assessment_type": "dynamic", "item_code": "DCP-001",
     "item_name": "The Master applies overriding authority and responsibility effectively.",
     "guidance_note": "Responsibility and overriding authority of Master:\n1. Communications with Bridge Team open and clearly understood.\n2. Always situationally aware.\n3. Team awareness: not complacent, nor over pressurised, fatigued.\n4. Following best practices avoiding short cuts.\n5. Promoting team work."},
    {"category": "Company Policy", "assessment_type": "dynamic", "item_code": "DCP-002",
     "item_name": "The requirements of the company's navigation policies and procedures are fully satisfied.",
     "guidance_note": "Master's nav assessment after joining. Standing orders explanation."},
    {"category": "Company Policy", "assessment_type": "dynamic", "item_code": "DCP-003",
     "item_name": "The bridge team is familiar and always compliant with the company restricted visibility policy.",
     "guidance_note": "Familiarity and compliance of Bridge team with restricted visibility requirements."},
    {"category": "Company Policy", "assessment_type": "dynamic", "item_code": "DCP-004",
     "item_name": "Standby conditions are discussed and documented well before the event, and all company requirements for standby are being met in full.",
     "guidance_note": None},
    {"category": "Company Policy", "assessment_type": "dynamic", "item_code": "DCP-005",
     "item_name": "Company anchoring procedures are understood and complied with.",
     "guidance_note": "Anchoring procedures compliance:\n1. Anchors kept ready for use.\n2. Personnel standby.\n3. Anchoring position identified in advance.\n4. Test of windlass and brakes prior anchoring. Test communications.\n5. Record and mark position, swinging circle, bearings."},

    # Bridge Team Organisation (11 items)
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-001",
     "item_name": "The manning level of the bridge is adequate at all times.",
     "guidance_note": "1. Adequate manning.\n2. Prevent distraction — Music, social entertainment, mobile phones restrictions, no non-essential persons."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-002",
     "item_name": "A proper lookout is maintained.",
     "guidance_note": "Lookout availability and communication with watchkeeper."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-003",
     "item_name": "Fatigue is monitored and managed effectively at all times.",
     "guidance_note": "Fatigue management: If 6 on 6 off watch over extended period make a remark."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-004",
     "item_name": "The bridge team is neither over-pressurised nor complacent.",
     "guidance_note": "Bridge team not over pressurised or complacent: Sharing information, taking short cuts, sharing decision making, effective communication."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-005",
     "item_name": "The bridge team members maintain a high level of situational awareness at all times.",
     "guidance_note": "Situational Awareness: Efficiently dealing with information flow, developing hazards, close quarters, assessment of sea room, assessing developing traffic situations, delegating, varying influence of speed."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-006",
     "item_name": "Communications within the bridge team are effective.",
     "guidance_note": "Communication with Bridge Team effective:\n1. Clear and concise, understood by all, closed loop, open to questioning, positive intervention, regular briefings/debriefings amongst bridge team members."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-007",
     "item_name": "Activities are planned in good time and workload is delegated efficiently.",
     "guidance_note": None},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-008",
     "item_name": "The bridge team works well as a unit.",
     "guidance_note": "Bridge team as a unit: No hierarchical barriers, coaching, training, mentoring."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-009",
     "item_name": "Decision-making is effective.",
     "guidance_note": "Effective decision making: Unambiguous, address doubts, intervention by members to master, decisions not contravening to SMS or COLREG (other than overriding authority)."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-010",
     "item_name": "Bridge team members have a good understanding of their responsibilities and demonstrate confidence in their execution.",
     "guidance_note": "Bridge Team — Understanding responsibility: Ask questions, confidence when in Con, decision making, giving orders, assessing situations, taking early actions, interaction with ER, Pilot, calling master when required."},
    {"category": "Bridge Team Organisation", "assessment_type": "dynamic", "item_code": "DBT-011",
     "item_name": "Coaching, training and mentoring are actively promoted on board.",
     "guidance_note": "Coaching, mentoring: Promotion of next rank work, hands on training."},

    # Duties (12 items)
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-001",
     "item_name": "The Designated Navigating Officer is thoroughly familiar with their responsibilities, including industry, company and the Master's requirements for passage planning.",
     "guidance_note": None},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-002",
     "item_name": "The OOW complies with responsibilities, authority and primary duties as defined by the company.",
     "guidance_note": "Under Con OOW complies with responsibility."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-003",
     "item_name": "The OOW is fully aware of when to call the Master as per standing orders.",
     "guidance_note": "Verify if practised."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-004",
     "item_name": "The bridge team fosters a two-way flow of information, encourages intervention and challenge, and involves all in the decision-making process, irrespective of who has the con.",
     "guidance_note": "Bridge team evidence of two way communication, intervention, challenge and response."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-005",
     "item_name": "The watchkeeper is fully integrated into the bridge team.",
     "guidance_note": "Watchkeeper is integrated in bridge team and is appraised of developments. Reporting targets and occasionally at Radar."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-006",
     "item_name": "The experience of new watchkeeping officers and ratings are assessed.",
     "guidance_note": None},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-007",
     "item_name": "The OOW displays a high level of awareness regarding the daily operation of the vessel.",
     "guidance_note": "Day work awareness."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-008",
     "item_name": "The requirements for safety rounds are being complied with.",
     "guidance_note": "Safety rounds not done by duty lookout — check compliance."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-009",
     "item_name": "The watch handover is effective, with all relevant information handed over.",
     "guidance_note": "Change of watch OOW and rating: Before time, not handed over when altering course, close quarters, or collision avoidance. Effective verbal handover."},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-010",
     "item_name": "The bridge team are fully familiar with the initial actions in response to an emergency.",
     "guidance_note": None},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-011",
     "item_name": "The OOW has a good appreciation of the current and forecast environmental conditions.",
     "guidance_note": None},
    {"category": "Duties", "assessment_type": "dynamic", "item_code": "DDU-012",
     "item_name": "Checklists are completed correctly, with all checks and tests comprehensively carried out.",
     "guidance_note": "Checklists entered correctly."},

    # General Navigation (8 items)
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-001",
     "item_name": "Celestial navigation is regularly practised by the bridge team members.",
     "guidance_note": "Celestial navigation practised."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-002",
     "item_name": "The COLREGS are thoroughly understood and diligently applied by the bridge team.",
     "guidance_note": "COLREG followed, AIS not used for collision avoidance."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-003",
     "item_name": "The vessel is navigated at a safe speed.",
     "guidance_note": "Navigated at safe speed as marked on ENC, defined in passage plan and UKC checklist."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-004",
     "item_name": "Traffic is monitored effectively, including at anchor.",
     "guidance_note": "Traffic monitored — by visual, audio, electronic and CPA/TCPA. Additional manning in high traffic areas."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-005",
     "item_name": "Track management is actively practised.",
     "guidance_note": "Track management: on track, XTE management, use of PI."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-006",
     "item_name": "VHF and external communications management are effective.",
     "guidance_note": None},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-007",
     "item_name": "Bridge team members are familiar with the type and characteristics of all sensors and alarms fitted to navigational equipment.",
     "guidance_note": "Familiarity with alarm settings."},
    {"category": "General Navigation", "assessment_type": "dynamic", "item_code": "DGN-008",
     "item_name": "ECDIS route monitoring is carried out effectively.",
     "guidance_note": "ECDIS Route monitoring:\n1. Safety contours and Safety depths.\n2. Draft correct on ECDIS.\n3. XTD defined for legs.\n4. Correct safety frame and grounding cone.\n5. Alarms Enabled.\n6. No active danger.\n7. Corrective display layer.\n8. Correct chart and appropriate level of zoom.\n9. Sensor inputs are correct.\n10. SOG and COG used.\n11. AIO turned on.\n12. Use of Radar overlay."},

    # Passage Planning — Dynamic (6 items)
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-001",
     "item_name": "The passage plan is effectively monitored and executed.",
     "guidance_note": "Effective execution of PP from berth to berth as planned. All aspects of human factors: teamwork, communications, complacency, intervention, capability, situational awareness, fatigue, pressure, distractions and culture."},
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-002",
     "item_name": "The passage plan briefing prior to departure is effective.",
     "guidance_note": "Effective briefing of passage plan and learnings if heard."},
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-003",
     "item_name": "The passage plan debrief on completion of a voyage is effective, and learnings are shared.",
     "guidance_note": "Effective debriefing of passage plan and learnings if heard."},
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-004",
     "item_name": "Position fixing effectively monitors the vessel's progress.",
     "guidance_note": "Position fixing under Stand-By conditions:\n1. Radar overlay after every course alteration and frequent intervals.\n2. Position verification by manual three point fix at intervals specified by company.\nOther conditions:\n1. PV by Radar, bearing, range LOP.\n2. Radar overlay if feasible.\n3. Use GPS."},
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-005",
     "item_name": "The squat calculation is being used correctly, and the OOW is aware of how squat and bank effect will affect the vessel.",
     "guidance_note": "Correct squat calculation: For Max speed."},
    {"category": "Passage Planning", "assessment_type": "dynamic", "item_code": "DPP-006",
     "item_name": "When required, mandatory routeing, ship reporting systems and vessel traffic services are complied with in full.",
     "guidance_note": None},

    # Use and Understanding of Bridge Equipment (10 items)
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-001",
     "item_name": "The Master and deck officers are fully familiar with the operation and limitations of the navigation and communications equipment on board.",
     "guidance_note": "Familiarity with Bridge equipment:\n1. Equipment set correctly.\n2. Alarms set correctly."},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-002",
     "item_name": "All deck officers are fully familiar with steering changeover procedures, including emergency steering, and the use of manual steering.",
     "guidance_note": "Familiarity and use of steering:\n1. Timely use of Helmsman."},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-003",
     "item_name": "All deck officers are familiar with the actions to be taken in the event of a gyro compass failure.",
     "guidance_note": None},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-004",
     "item_name": "All deck officers are familiar with radar and ARPA, including the limitations of the equipment.",
     "guidance_note": "Familiarity with ARPA and Limitations:\n1. Water track.\n2. Trail lengths.\n3. Appropriate range scale.\n4. Alarm setting for CPA/TCPA."},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-005",
     "item_name": "All deck officers are familiar with AIS, including the limitations of the equipment.",
     "guidance_note": "AIS familiarity and limitations:\n1. Operational settings are correct.\n2. AIS data not left on continuously."},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-006",
     "item_name": "All deck officers are familiar with GPS, including the limitations of the equipment.",
     "guidance_note": None},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-007",
     "item_name": "The bridge team is aware of ECDIS limitations and operational capabilities.",
     "guidance_note": "ECDIS familiarity and limitations and OVERRELIANCE:\n1. Position fixing by PI, Radar, Visual, LOPS."},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-008",
     "item_name": "Bridge team members are familiar with the types and characteristics of ECDIS alarms.",
     "guidance_note": None},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-009",
     "item_name": "All deck officers are familiar with the immediate response to ECDIS failure and associated sensor failures.",
     "guidance_note": None},
    {"category": "Use and Understanding of Bridge Equipment", "assessment_type": "dynamic", "item_code": "DUB-010",
     "item_name": "Navigation, NAVTEX and weather warnings are processed and circulated efficiently.",
     "guidance_note": None},

    # Pilotage (8 items)
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-001",
     "item_name": "The Pilot transfer procedure is effective.",
     "guidance_note": "Transfer Procedure:\n1. Both OOW and lookout to remain on bridge."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-002",
     "item_name": "Pre-arrival information has been discussed effectively and the passage plan has been amended where required.",
     "guidance_note": "Changes in passage plan after pilot information — plan is amended and documented."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-003",
     "item_name": "The Master/Pilot information exchange is effective and concise, and intentions are passed to the bridge team.",
     "guidance_note": "MPEX:\n1. ER appraised."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-004",
     "item_name": "The bridge team maintains situational awareness throughout pilotage.",
     "guidance_note": "Situational awareness: Monitor effectively."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-005",
     "item_name": "The intended passage under pilotage is effectively monitored.",
     "guidance_note": "Advising pilot of speed, cross track and approaching alterations."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-006",
     "item_name": "Communications under pilotage are effective.",
     "guidance_note": "Communications under pilotage are effective:\n1. Closed loop and effective."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-007",
     "item_name": "Watchkeepers are used effectively throughout the pilotage.",
     "guidance_note": "1. Lookout feeds information to bridge team.\n2. Helmsman carries out instructions effectively.\n3. Bridge team advise pilot about traffic."},
    {"category": "Pilotage", "assessment_type": "dynamic", "item_code": "DPI-008",
     "item_name": "Berth approach and mooring operations are effective and conducted safely.",
     "guidance_note": None},
]

assert len(CHECKLIST_ITEMS) == 121, f"Expected 121 items, got {len(CHECKLIST_ITEMS)}"

VESSELS = [
    {"name": "MV Atlantic Star",   "imo": "IMO9234567", "type": VesselType.bulk_carrier,   "flag": "Panama",           "year": 2008, "gt": 45000, "port": "Rotterdam"},
    {"name": "MV Nordic Trader",   "imo": "IMO9345678", "type": VesselType.container,       "flag": "Liberia",          "year": 2012, "gt": 28000, "port": "Singapore"},
    {"name": "MV Pacific Queen",   "imo": "IMO9456789", "type": VesselType.tanker,          "flag": "Marshall Islands", "year": 2010, "gt": 62000, "port": "Houston"},
    {"name": "MV Baltic Arrow",    "imo": "IMO9567890", "type": VesselType.ro_ro,           "flag": "Bahamas",          "year": 2015, "gt": 18000, "port": "Hamburg"},
    {"name": "MV Horizon Voyager", "imo": "IMO9678901", "type": VesselType.general_cargo,   "flag": "Cyprus",           "year": 2007, "gt": 12000, "port": "Piraeus"},
    {"name": "MV Caspian Spirit",  "imo": "IMO9789012", "type": VesselType.tanker,          "flag": "Malta",            "year": 2011, "gt": 55000, "port": "Fujairah"},
]

PORTS = ["Rotterdam", "Singapore", "Houston", "Hamburg", "Piraeus", "Fujairah", "Antwerp", "Dubai", "Santos", "Busan"]


def score_for_vessel_item(vessel_name: str, category: str, month_offset: int):
    """
    Generate realistic 0-5 scores + occasional NS for demo data.
    Score range matches Yatendra's Excel: 0=Hazard, 1-2=Poor, 3-4=Fair/Good, 5=Excellent.
    NS = Not Sighted (~10% of items for realistic demo).
    """
    # ~10% chance of NS for any item/vessel
    if random.random() < 0.10:
        return "NS"

    if vessel_name == "MV Baltic Arrow":
        return random.choices([4, 5], weights=[3, 7])[0]

    if vessel_name == "MV Pacific Queen" and category in ("Passage Planning", "Forms and Checklists"):
        if month_offset <= 6:
            return random.choices([1, 2, 3], weights=[3, 5, 2])[0]
        elif month_offset <= 12:
            return random.choices([2, 3, 4], weights=[2, 4, 4])[0]
        else:
            return random.choices([3, 4, 5], weights=[2, 5, 3])[0]

    if vessel_name == "MV Caspian Spirit":
        if month_offset >= 15:
            return random.choices([0, 1, 2, 3, 4], weights=[1, 2, 4, 4, 2])[0]
        elif month_offset >= 9:
            return random.choices([2, 3, 4, 5], weights=[2, 4, 5, 3])[0]
        else:
            return random.choices([3, 4, 5], weights=[2, 5, 3])[0]

    if vessel_name == "MV Horizon Voyager":
        return random.choices([2, 3, 4, 5], weights=[1, 3, 5, 2])[0]

    return random.choices([2, 3, 4, 5], weights=[1, 2, 5, 4])[0]


async def clear_all():
    print("Clearing existing data...")
    await Company.delete_all()
    await User.delete_all()
    await Vessel.delete_all()
    await InspectionRequest.delete_all()
    await ChecklistTemplate.delete_all()
    await ChecklistItem.delete_all()
    await Inspection.delete_all()
    await InspectionScore.delete_all()
    await CriteriaSet.delete_all()


async def seed():
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
        document_models=[
            Company, User, Vessel, InspectionRequest,
            ChecklistTemplate, ChecklistItem, Inspection, InspectionScore,
            CriteriaSet,
        ],
    )

    await clear_all()

    # ── Companies ────────────────────────────────────────────────────────────
    print("Creating companies...")
    consultancy = Company(
        name="Nordic Maritime Solutions",
        code="NMS",
        contact_email="ops@nordicmaritime.com",
    )
    await consultancy.insert()

    shipping_co = Company(
        name="Atlantic Shipping Group",
        code="ASG",
        contact_email="fleet@atlanticshipping.com",
    )
    await shipping_co.insert()

    # ── Users ─────────────────────────────────────────────────────────────────
    print("Creating users...")
    admin = User(
        name="Sarah Jensen",
        email="admin@nordicmaritime.com",
        password_hash=hash_password("admin123"),
        role=UserRole.consultancy_admin,
        company_id=consultancy.id,
    )
    await admin.insert()

    surveyor1 = User(
        name="James Mitchell",
        email="james@nordicmaritime.com",
        password_hash=hash_password("surveyor123"),
        role=UserRole.surveyor,
        company_id=consultancy.id,
    )
    await surveyor1.insert()

    surveyor2 = User(
        name="Elena Petrov",
        email="elena@nordicmaritime.com",
        password_hash=hash_password("surveyor123"),
        role=UserRole.surveyor,
        company_id=consultancy.id,
    )
    await surveyor2.insert()

    shipping_viewer = User(
        name="Marcus Haugen",
        email="marcus@atlanticshipping.com",
        password_hash=hash_password("viewer123"),
        role=UserRole.shipping_company,
        company_id=shipping_co.id,
    )
    await shipping_viewer.insert()

    viewer = User(
        name="Demo Viewer",
        email="viewer@marinepulse.com",
        password_hash=hash_password("viewer123"),
        role=UserRole.viewer,
    )
    await viewer.insert()

    surveyors = [surveyor1, surveyor2]

    # ── Vessels ───────────────────────────────────────────────────────────────
    print("Creating vessels...")
    vessel_docs = []
    for v in VESSELS:
        vessel = Vessel(
            company_id=shipping_co.id,
            name=v["name"],
            imo_number=v["imo"],
            vessel_type=v["type"],
            flag_state=v["flag"],
            year_built=v["year"],
            gross_tonnage=v["gt"],
            current_port=v["port"],
        )
        await vessel.insert()
        vessel_docs.append(vessel)

    # ── Checklist Template ────────────────────────────────────────────────────
    print("Creating checklist template (121-item navigational audit)...")
    template = ChecklistTemplate(
        name="Navigational Audit Checklist — Nivyash Marine",
        inspection_type="navigational_audit",
        version="v2026.1",
        uploaded_by=admin.id,
        total_items=len(CHECKLIST_ITEMS),
    )
    await template.insert()

    item_docs = []
    for i, item_data in enumerate(CHECKLIST_ITEMS):
        item = ChecklistItem(
            template_id=template.id,
            category=item_data["category"],
            assessment_type=item_data["assessment_type"],
            item_code=item_data["item_code"],
            item_name=item_data["item_name"],
            guidance_note=item_data.get("guidance_note"),
            weight=1,
            sort_order=i,
        )
        await item.insert()
        item_docs.append(item)

    # ── Inspections ───────────────────────────────────────────────────────────
    print(f"Creating inspections (36 historical + 1 in-progress, {len(item_docs)} items each)...")
    now = datetime.utcnow()
    inspection_count = 0

    for vessel in vessel_docs:
        for month_offset in range(0, 18, 3):  # quarterly, 6 inspections per vessel
            insp_date = now - timedelta(days=month_offset * 30)
            port = random.choice(PORTS)
            surveyor = random.choice(surveyors)

            is_live_demo = (vessel.name == "MV Nordic Trader" and month_offset == 0)

            status = InspectionStatus.in_progress if is_live_demo else InspectionStatus.reviewed
            inspection = Inspection(
                vessel_id=vessel.id,
                company_id=shipping_co.id,
                surveyor_id=surveyor.id,
                template_id=template.id,
                port=port,
                inspection_date=insp_date,
                submitted_at=insp_date + timedelta(hours=8) if not is_live_demo else None,
                reviewed_at=insp_date + timedelta(days=2) if not is_live_demo else None,
                reviewed_by=admin.id if not is_live_demo else None,
                status=status,
                total_items=len(item_docs),
            )
            await inspection.insert()

            scores_data = []
            for item in item_docs:
                score = score_for_vessel_item(vessel.name, item.category, month_offset)
                is_deficiency = isinstance(score, int) and score < 3
                insp_score = InspectionScore(
                    inspection_id=inspection.id,
                    checklist_item_id=item.id,
                    category=item.category,
                    assessment_type=item.assessment_type,
                    weight=item.weight,
                    score=score if not is_live_demo else None,
                    is_deficiency=is_deficiency if not is_live_demo else False,
                    comment=f"Noted during inspection at {port}" if is_deficiency and not is_live_demo else None,
                )
                await insp_score.insert()
                scores_data.append({
                    "weight": item.weight,
                    "score": score,
                    "category": item.category,
                    "assessment_type": item.assessment_type,
                })

            if not is_live_demo:
                result = compute_audit_score(scores_data)
                percentage = result["percentage"]
                grade = grade_from_vhi(percentage)
                deficiency_count = sum(1 for s in scores_data if isinstance(s["score"], int) and s["score"] < 3)

                await inspection.set({
                    "vhi_score": percentage,
                    "vhi_grade": grade,
                    "scored_items": len(item_docs),
                    "deficiency_count": deficiency_count,
                    "critical_deficiency_count": 0,
                })
                inspection_count += 1
                print(f"  {vessel.name} [{insp_date.strftime('%Y-%m')}] Score={percentage}% ({grade}) deficiencies={deficiency_count}")

    # ── Criteria Sets ─────────────────────────────────────────────────────────
    print("Creating default criteria set (80-criterion SIRE 2.0 Passage Plan)...")
    sire_criteria = [
        Criterion(
            id=c["id"],
            category=c["category"],
            label=c["label"],
            priority=c["priority"],
        )
        for c in CRITERIA
    ]
    default_criteria_set = CriteriaSet(
        name="SIRE 2.0 Passage Plan Criteria",
        description=(
            "80-criterion evaluation framework aligned with OCIMF SIRE 2.0 VIQ, "
            "ICS Bridge Procedures Guide, ISM Code, and IMO MSC-Circ.1533. "
            "Covers Appraisal (A), Planning (B), Execution (C), UKC & Clearance (D), "
            "Contingency (E), Reporting (F), Documentation (G), and Quality (H)."
        ),
        company_id=None,  # global — available to all companies
        criteria=sire_criteria,
        is_default=True,
        created_at=datetime.utcnow(),
    )
    await default_criteria_set.insert()

    print(f"\n✅ Seed complete!")
    print(f"   Companies: 2")
    print(f"   Users: 5 (admin@nordicmaritime.com / admin123, james@nordicmaritime.com / surveyor123)")
    print(f"   Vessels: {len(vessel_docs)}")
    print(f"   Checklist items: {len(item_docs)} (121-item navigational audit)")
    print(f"   Completed inspections: {inspection_count}")
    print(f"   In-progress (demo): MV Nordic Trader (current month)")
    print(f"   Criteria sets: 1 (SIRE 2.0 Passage Plan, 80 criteria, global default)")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
