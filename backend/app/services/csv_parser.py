import csv
import io
from typing import List, Dict


def parse_checklist_csv(content: str) -> List[Dict]:
    """
    Expected CSV columns: Category, ItemCode, ItemName, Description, Weight
    Returns list of dicts ready to create ChecklistItem documents.
    """
    reader = csv.DictReader(io.StringIO(content))
    items = []
    for i, row in enumerate(reader):
        category = (row.get("Category") or row.get("category") or "").strip()
        item_name = (row.get("ItemName") or row.get("item_name") or row.get("Inspection Item") or "").strip()
        item_code = (row.get("ItemCode") or row.get("item_code") or f"ITEM-{i+1:03d}").strip()
        description = (row.get("Description") or row.get("description") or "").strip()
        weight_str = (row.get("Weight") or row.get("weight") or "1").strip()

        try:
            weight = int(weight_str)
            weight = max(1, min(3, weight))  # clamp to 1-3
        except ValueError:
            weight = 1

        if category and item_name:
            items.append({
                "category": category,
                "item_code": item_code,
                "item_name": item_name,
                "description": description,
                "weight": weight,
                "sort_order": i,
            })
    return items
