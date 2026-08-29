"""
LangChain / LangGraph 接入示例：只改 base_url 就能把 LLM 换成 Mock Server。

    pip install langchain-openai
    python examples/langgraph_agent.py

工作台里会实时看到 Agent 的每一次请求；如果项目的兜底行为是「转人工」，
请求会挂起，等你在 UI 上点 Reply / Think / Tool Call 之后才返回。
"""

import json
import os

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

BASE_URL = os.environ.get("MOCK_BASE_URL", "http://localhost:3000/langgraph-demo/v1")
API_KEY = os.environ.get("MOCK_API_KEY", "sk-mock-demo")


@tool
def get_order(order_id: str) -> str:
    """查询订单状态。"""
    # 真实项目里这里会调后端；调试阶段可以直接返回假数据，
    # 或者请求 Mock Server 的 POST /v1/tools/get_order 拿统一配置的假响应。
    return json.dumps({"order_id": order_id, "status": "paid"}, ensure_ascii=False)


llm = ChatOpenAI(
    model="gpt-4o",
    base_url=BASE_URL,
    api_key=API_KEY,
    temperature=0,
    default_headers={"X-Mock-Session-Name": "LangGraph 示例"},
).bind_tools([get_order])

messages = [HumanMessage("帮我查询订单 123456，如果已支付就告诉我能不能退款")]

for round_index in range(1, 6):
    response = llm.invoke(messages)
    messages.append(response)
    print(f"\n--- 第 {round_index} 轮 ---")
    if response.content:
        print("回复:", response.content)
    if not response.tool_calls:
        break

    for call in response.tool_calls:
        print("Tool Call:", call["name"], call["args"])
        result = get_order.invoke(call["args"])
        print("Tool 结果:", result)
        messages.append(ToolMessage(content=result, tool_call_id=call["id"]))
