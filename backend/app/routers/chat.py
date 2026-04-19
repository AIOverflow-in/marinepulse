import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI

from app.config import settings
from app.models.user import User
from app.models.chat_session import ChatSession, SessionMessage
from app.dependencies import get_current_user
from app.services.ai.tools import TOOLS
from app.services.ai.tool_handlers import TOOL_HANDLERS

router = APIRouter(prefix="/api/chat", tags=["chat"])

client = AsyncOpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """You are MarinePulse AI, an intelligent maritime operations assistant.
You have access to two data domains — always use your tools to fetch live data before answering:

1. VHI INSPECTIONS: vessel health index scores, deficiencies, category performance, fleet rankings.
2. AUDITVAAULT AI / WEEKLY LOGS: weekly operational records per vessel including:
   - Safety system checks (GM 2.10.7 A3 — weekly/monthly/quarterly tests)
   - Maintenance logs (ER tasks, electrical tasks across 8 categories)
   - Drill records (fire drills, MOB, abandon ship, safety meetings)
   - Main Engine performance (cylinder TBN residuals, Fe ppm, cold corrosion / over-lubrication diagnosis)
   - AI-generated superintendent reports and anomaly alerts
   - Overdue safety test alerts

When answering about engine health, safety compliance, or operational logs — use the AuditVault tools.
When answering about VHI scores, inspection grades, or deficiency audits — use the inspection tools.

Always present data in a clear, professional format. Use markdown tables where helpful.
Provide actionable insights. Be concise but thorough."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


@router.get("/sessions")
async def list_sessions(current_user: User = Depends(get_current_user)):
    sessions = await ChatSession.find(
        ChatSession.user_id == current_user.id
    ).sort(-ChatSession.updated_at).to_list()
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "message_count": len(s.messages),
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user: User = Depends(get_current_user)):
    session = await ChatSession.get(session_id)
    if not session or str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": str(session.id),
        "title": session.title,
        "messages": [{"role": m.role, "content": m.content} for m in session.messages],
        "created_at": session.created_at.isoformat(),
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    session = await ChatSession.get(session_id)
    if not session or str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Session not found")
    await session.delete()
    return {"message": "Session deleted"}


@router.post("")
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    # Load or create session
    session: Optional[ChatSession] = None
    if body.session_id:
        session = await ChatSession.get(body.session_id)
        if session and str(session.user_id) != str(current_user.id):
            session = None  # don't allow accessing other users' sessions

    # The last message from the client is the new user message
    new_user_message = body.messages[-1] if body.messages else None

    if not session:
        title = (new_user_message.content[:60] + "...") if new_user_message and len(new_user_message.content) > 60 else (new_user_message.content if new_user_message else "New Chat")
        session = ChatSession(
            user_id=current_user.id,
            title=title,
            messages=[],
        )
        await session.insert()

    # Append new user message to session
    if new_user_message:
        session.messages.append(SessionMessage(role="user", content=new_user_message.content))

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in session.messages]

    async def generate():
        nonlocal messages, session
        assistant_reply = ""

        for _ in range(5):
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                stream=False,
            )
            msg = response.choices[0].message

            if msg.tool_calls:
                messages.append(msg.model_dump(exclude_none=True))
                for tc in msg.tool_calls:
                    fn_name = tc.function.name
                    fn_args = json.loads(tc.function.arguments)
                    handler = TOOL_HANDLERS.get(fn_name)
                    if handler:
                        result = await handler(fn_args)
                    else:
                        result = json.dumps({"error": f"Unknown tool: {fn_name}"})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })
            else:
                stream = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    stream=True,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        assistant_reply += delta
                        yield delta

                # Save assistant reply to session
                session.messages.append(SessionMessage(role="assistant", content=assistant_reply))
                session.updated_at = datetime.utcnow()
                await session.save()
                return

        fallback = "I was unable to complete your request after multiple attempts."
        assistant_reply = fallback
        session.messages.append(SessionMessage(role="assistant", content=fallback))
        session.updated_at = datetime.utcnow()
        await session.save()
        yield fallback

    headers = {"X-Session-Id": str(session.id)}
    return StreamingResponse(generate(), media_type="text/plain", headers=headers)
