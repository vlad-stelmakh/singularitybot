"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { CompositeMcpClient } = require("../bot/composite-mcp-client");

function fakeClient(tools) {
  return {
    closed: false,
    getOpenAiTools() {
      return tools.map((name) => ({
        type: "function",
        function: { name, description: name, parameters: { type: "object", properties: {} } },
      }));
    },
    async callTool(name, args) {
      return { text: `${name}:${JSON.stringify(args || {})}`, isError: false };
    },
    async close() {
      this.closed = true;
    },
  };
}

test("объединяет инструменты и маршрутизирует вызовы", async () => {
  const singularity = fakeClient(["listTasks"]);
  const jira = fakeClient(["jira_my_sprint"]);
  const composite = new CompositeMcpClient([singularity, jira]);

  const names = composite.getOpenAiTools().map((tool) => tool.function.name);
  assert.deepEqual(names, ["listTasks", "jira_my_sprint"]);

  const result = await composite.callTool("jira_my_sprint", { mineOnly: true });
  assert.equal(result.text, 'jira_my_sprint:{"mineOnly":true}');
});

test("не закрывает дочерние клиенты по умолчанию", async () => {
  const singularity = fakeClient(["listTasks"]);
  const jira = fakeClient(["jira_my_sprint"]);
  const composite = new CompositeMcpClient([singularity, jira]);
  await composite.close();
  assert.equal(singularity.closed, false);
  assert.equal(jira.closed, false);
});

test("закрывает дочерние клиенты по флагу", async () => {
  const singularity = fakeClient(["listTasks"]);
  const composite = new CompositeMcpClient([singularity], { closeChildren: true });
  await composite.close();
  assert.equal(singularity.closed, true);
});

test("ошибка при конфликте имён инструментов", () => {
  const composite = new CompositeMcpClient([
    fakeClient(["shared"]),
    fakeClient(["shared"]),
  ]);
  assert.throws(() => composite.getOpenAiTools(), /Конфликт имён/);
});
