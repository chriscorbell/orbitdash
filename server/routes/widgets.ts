import { Hono } from "hono";
import { AGENDA_DAY_OPTIONS } from "@shared/dashboard-settings";
import { agendaFeedCreateSchema, weatherQuerySchema } from "@shared/widget-schemas";
import { jsonError } from "../api-response";
import { writeLog } from "../observability";
import { readValidatedJson } from "../request-body";
import { AgendaFeedError, agendaService } from "../widgets/agenda";
import { weatherService } from "../widgets/weather";

const widgetsRouter = new Hono();

function logUnavailable(event: string, error: unknown) {
  writeLog("warn", event, { message: error instanceof Error ? error.message : String(error) });
}

/** GET /api/widgets/weather?latitude=45.5&longitude=-122.7&units=metric */
widgetsRouter.get("/weather", async (c) => {
  const query = weatherQuerySchema.safeParse(c.req.query());
  if (!query.success) return jsonError(c, 400, "latitude and longitude are required");
  const { latitude, longitude, units } = query.data;
  try {
    return c.json(await weatherService.forecast(latitude, longitude, units));
  } catch (error) {
    logUnavailable("weather.unavailable", error);
    return jsonError(c, 503, "Weather is unavailable right now");
  }
});

/** GET /api/widgets/geocode?q=Portland — places for the weather location picker */
widgetsRouter.get("/geocode", async (c) => {
  try {
    return c.json({ results: await weatherService.geocode(c.req.query("q") ?? "") });
  } catch (error) {
    logUnavailable("geocode.unavailable", error);
    return jsonError(c, 503, "Place search is unavailable right now");
  }
});

/** GET /api/widgets/agenda?days=7 — upcoming events from the saved calendar feeds */
widgetsRouter.get("/agenda", async (c) => {
  const requested = Number(c.req.query("days"));
  const days = (AGENDA_DAY_OPTIONS as readonly number[]).includes(requested) ? requested : 7;
  return c.json(await agendaService.agenda(days));
});

/** GET /api/widgets/agenda/feeds — names and hosts only; the links stay on the server */
widgetsRouter.get("/agenda/feeds", (c) => c.json({ feeds: agendaService.listFeeds() }));

/** POST /api/widgets/agenda/feeds — { name, url } of an iCal feed, checked before it's saved */
widgetsRouter.post("/agenda/feeds", async (c) => {
  const body = await readValidatedJson(c, agendaFeedCreateSchema);
  if (body.response) return body.response;
  try {
    return c.json(await agendaService.addFeed(body.data), 201);
  } catch (error) {
    if (error instanceof AgendaFeedError) return jsonError(c, 400, error.message);
    throw error;
  }
});

widgetsRouter.delete("/agenda/feeds/:id", (c) =>
  agendaService.removeFeed(c.req.param("id"))
    ? c.json({ success: true })
    : jsonError(c, 404, "not found")
);

export default widgetsRouter;
