"""
Replace existing checklist template with the real maritime inspection checklist.
Run: cd backend && source venv/bin/activate && python scripts/replace_checklist.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.models.checklist_template import ChecklistTemplate
from app.models.checklist_item import ChecklistItem
from app.models.inspection_score import InspectionScore
from app.services.csv_parser import parse_checklist_csv

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/marinepulse")
CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checklist_real.csv")


async def main():
    client = AsyncIOMotorClient(MONGODB_URI)
    db_name = MONGODB_URI.split("/")[-1].split("?")[0]
    await init_beanie(
        database=client[db_name],
        document_models=[ChecklistTemplate, ChecklistItem, InspectionScore],
    )

    # Load CSV
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    parsed = parse_checklist_csv(content)
    print(f"Parsed {len(parsed)} items from CSV")

    # Find existing templates
    existing = await ChecklistTemplate.find_all().to_list()
    print(f"Found {len(existing)} existing template(s)")

    for tmpl in existing:
        # Delete all checklist items for this template
        deleted_items = await ChecklistItem.find(
            ChecklistItem.template_id == tmpl.id
        ).to_list()
        for item in deleted_items:
            await item.delete()
        print(f"  Deleted {len(deleted_items)} items from template '{tmpl.name}'")

        # Update template metadata
        await tmpl.set({
            "name": "Maritime Vessel Inspection Checklist",
            "version": "v2.0",
            "total_items": len(parsed),
            "is_active": True,
        })

        # Insert new items
        new_items = [
            ChecklistItem(
                template_id=tmpl.id,
                category=item["category"],
                item_code=item["item_code"],
                item_name=item["item_name"],
                description=item.get("description", ""),
                weight=item["weight"],
                sort_order=item["sort_order"],
            )
            for item in parsed
        ]
        await ChecklistItem.insert_many(new_items)
        print(f"  Inserted {len(new_items)} new items into template '{tmpl.name}'")

    if not existing:
        # No existing template — create a new one
        tmpl = ChecklistTemplate(
            name="Maritime Vessel Inspection Checklist",
            version="v2.0",
            total_items=len(parsed),
        )
        await tmpl.insert()
        new_items = [
            ChecklistItem(
                template_id=tmpl.id,
                category=item["category"],
                item_code=item["item_code"],
                item_name=item["item_name"],
                description=item.get("description", ""),
                weight=item["weight"],
                sort_order=item["sort_order"],
            )
            for item in parsed
        ]
        await ChecklistItem.insert_many(new_items)
        print(f"Created new template with {len(new_items)} items")

    print("\nDone. Categories in new checklist:")
    categories = {}
    for item in parsed:
        categories[item["category"]] = categories.get(item["category"], 0) + 1
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count} items")


asyncio.run(main())
