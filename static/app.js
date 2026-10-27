const eventsNode = document.querySelector("#events");
const template = document.querySelector("#event-template");
const countNode = document.querySelector("#count");
const hintNode = document.querySelector("#empty-hint");
const endpointNode = document.querySelector("#endpoint");
const statusNode = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
let events = [];

const endpoint = `${window.location.origin}/hooks/my-service`;
endpointNode.textContent = endpoint;

function pretty(value) {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value || "(empty string)";
  return JSON.stringify(value, null, 2);
}

function methodClass(method) {
  return `method-${method.toLowerCase()}`;
}

function createEventCard(event, open = false) {
  const card = template.content.firstElementChild.cloneNode(true);
  const summary = card.querySelector(".event-summary");
  const method = card.querySelector(".method");
  method.textContent = event.method;
  method.classList.add(methodClass(event.method));
  card.querySelector(".path").textContent = event.path;
  card.querySelector(".size").textContent = `${event.sizeBytes} B`;
  const time = card.querySelector("time");
  time.dateTime = event.receivedAt;
  time.textContent = new Date(event.receivedAt).toLocaleString();
  card.querySelector(".client").textContent = event.client;
  card.querySelector(".event-id").textContent = event.id;
  card.querySelector(".body").textContent = pretty(event.body);
  card.querySelector(".headers").textContent = pretty(event.headers);
  card.querySelector(".query").textContent = pretty(event.query);
  if (open) card.classList.add("open");
  summary.addEventListener("click", () => card.classList.toggle("open"));
  return card;
}

function updateMeta() {
  countNode.textContent = `${events.length} ${events.length === 1 ? "request" : "requests"}`;
  hintNode.hidden = events.length > 0;
}

function renderAll() {
  eventsNode.replaceChildren(...events.map((event) => createEventCard(event)));
  updateMeta();
}

async function loadEvents() {
  const response = await fetch("/api/events");
  if (!response.ok) throw new Error(`Failed to load events (${response.status})`);
  const data = await response.json();
  events = data.events;
  renderAll();
}

function connect() {
  const stream = new EventSource("/api/stream");
  stream.onopen = () => {
    statusNode.textContent = "Live";
    statusDot.classList.add("online");
  };
  stream.addEventListener("webhook", ({ data }) => {
    const event = JSON.parse(data);
    events.unshift(event);
    eventsNode.prepend(createEventCard(event, true));
    updateMeta();
  });
  stream.onerror = () => {
    statusNode.textContent = "Reconnecting…";
    statusDot.classList.remove("online");
  };
}

document.querySelector("#copy").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(endpoint);
  event.currentTarget.textContent = "Copied";
  setTimeout(() => (event.currentTarget.textContent = "Copy URL"), 1200);
});

document.querySelector("#clear").addEventListener("click", async () => {
  const response = await fetch("/api/events", { method: "DELETE" });
  if (!response.ok) return;
  events = [];
  renderAll();
});

loadEvents().catch((error) => {
  statusNode.textContent = error.message;
});
connect();
