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
    # ── AuditVault AI / Vessel Log tools ─────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_vessel_weekly_logs",
            "description": "Get recent weekly operational logs for a vessel, showing completion status of all 5 AuditVault templates (safety checks, maintenance, photos, drills, ME performance), anomaly count, and submission status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of recent weekly logs to return (default 5, max 10)",
                        "default": 5,
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weekly_log_detail",
            "description": "Get full detail of a specific weekly log: anomalies detected, AI superintendent report, completion of each template, drill count, photo count. Use this when the user asks about a specific week's operational summary or AI report.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel",
                    },
                    "week_number": {
                        "type": "integer",
                        "description": "ISO week number (1-52). If omitted, returns the most recent log.",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year (e.g. 2026). If omitted, defaults to current year.",
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_me_performance_data",
            "description": "Get Main Engine cylinder performance data (TBN residuals, Fe ppm, diagnosis) for a vessel's weekly log. Use this for engine health questions, lubrication analysis, cold corrosion risk, or over-lubrication alerts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel",
                    },
                    "week_number": {
                        "type": "integer",
                        "description": "ISO week number. If omitted, returns most recent.",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year. If omitted, defaults to current year.",
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_safety_check_compliance",
            "description": "Get safety system check compliance for a vessel's weekly log — which items were completed, which were missed, and N/A items with reasons. Covers weekly, monthly, and quarterly tests per GM 2.10.7 A3.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel",
                    },
                    "week_number": {
                        "type": "integer",
                        "description": "ISO week number. If omitted, returns most recent.",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year. If omitted, defaults to current year.",
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_overdue_safety_alerts",
            "description": "Get overdue safety test alerts for a vessel — items that haven't been tested within their required frequency (weekly/monthly/quarterly). Returns days overdue and last performed date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vessel_name": {
                        "type": "string",
                        "description": "Name or partial name of the vessel",
                    },
                },
                "required": ["vessel_name"],
            },
        },
    },
]
