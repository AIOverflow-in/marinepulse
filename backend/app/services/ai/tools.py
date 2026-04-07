TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_vessel_inspection_summary",
            "description": "Get the latest inspection summary and VHI score for a specific vessel, including deficiency count and category breakdown.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel (case-insensitive search)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of recent inspections to return (default 1, max 5)",
                        "default": 1,
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fleet_vhi_ranking",
            "description": "Get all vessels ranked by their latest VHI score, showing best and worst performing vessels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order": {
                        "type": "string",
                        "enum": ["asc", "desc"],
                        "description": "Sort order: 'asc' for lowest VHI first, 'desc' for highest first",
                        "default": "desc",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recurring_deficiencies",
            "description": "List the most frequently occurring deficiencies (items scored < 3) across inspections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Optional: filter to a specific vessel",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional: filter to a specific category",
                    },
                    "top_n": {
                        "type": "integer",
                        "description": "How many top deficiencies to return (default 10)",
                        "default": 10,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_performance",
            "description": "Get average inspection scores broken down by checklist category for the fleet or a specific vessel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Optional: filter to a specific vessel",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_vessels",
            "description": "Compare VHI scores, deficiency counts, and performance between two or more vessels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of vessel names to compare",
                    }
                },
                "required": ["vessel_names"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pending_inspections",
            "description": "List inspections that are pending, in-progress, or submitted for review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "submitted", "all"],
                        "description": "Filter by status",
                        "default": "all",
                    }
                },
            },
        },
    },
]
