// World Cup data + prediction engine.
// Primary source: worldcup26.ir — free, open-source, NO AUTH (judges can run
// this with zero keys). Optional upgrade: API-Football via APIFOOTBALL_KEY.
// Engine: fans pick 1/X/2 on upcoming fixtures; the resolver agent grades
// picks from final scores and credits USDC winnings for CCTP payout.

import axios from "axios";
import { EventEmitter } from "events";

const WC_API = "https://worldcup26.ir/get";

export interface Match {
  id: string; home: string; away: string;
  kickoff: number;                    // ms epoch
  status: "upcoming" | "live" | "finished";
  homeScore?: number; awayScore?: number;
  stage?: string;
}

export class Engine extends EventEmitter {
  matches = new Map<string, Match>();

  constructor() { super(); }

  /** Poll fixtures + scores. Free API first; API-Football if key present. */
  async refresh() {
    try {
      if (process.env.APIFOOTBALL_KEY) await this.fromApiFootball();
      else await this.fromOpenApi();
      this.emit("matches", this.list());
    } catch (e: any) {
      console.warn("[data] refresh failed:", e.message);
    }
  }

  private async fromOpenApi() {
    const r = await axios.get(`${WC_API}/games`, { timeout: 15000 });
    const rows: any[] = r.data?.data ?? r.data ?? [];
    for (const g of rows) {
      const id = String(g.id ?? g._id ?? `${g.home_team}-${g.away_team}-${g.date}`);
      const kickoff = new Date(g.datetime ?? g.date ?? g.kickoff ?? 0).getTime();
      const hs = num(g.home_score ?? g.homeScore ?? g.home_result);
      const as_ = num(g.away_score ?? g.awayScore ?? g.away_result);
      const finished = /finish|complete|ft|full/i.test(String(g.status ?? "")) ||
        (g.finished === true);
      const live = /live|in.?play|1h|2h|ht/i.test(String(g.status ?? ""));
      this.matches.set(id, {
        id,
        home: g.home_team?.name ?? g.home_team ?? g.homeTeam ?? "TBD",
        away: g.away_team?.name ?? g.away_team ?? g.awayTeam ?? "TBD",
        kickoff,
        status: finished ? "finished" : live ? "live" : "upcoming",
        homeScore: hs, awayScore: as_,
        stage: g.stage ?? g.group ?? g.round,
      });
    }
  }

  private async fromApiFootball() {
    const r = await axios.get("https://v3.football.api-sports.io/fixtures", {
      params: { league: 1, season: 2026 }, timeout: 15000,
      headers: { "x-apisports-key": process.env.APIFOOTBALL_KEY! },
    });
    for (const f of r.data?.response ?? []) {
      const st = f.fixture.status.short;
      this.matches.set(String(f.fixture.id), {
        id: String(f.fixture.id),
        home: f.teams.home.name, away: f.teams.away.name,
        kickoff: new Date(f.fixture.date).getTime(),
        status: ["FT", "AET", "PEN"].includes(st) ? "finished"
              : ["NS", "TBD", "PST"].includes(st) ? "upcoming" : "live",
        homeScore: f.goals.home ?? undefined, awayScore: f.goals.away ?? undefined,
        stage: f.league.round,
      });
    }
  }

  list(): Match[] {
    return [...this.matches.values()].sort((a, b) => a.kickoff - b.kickoff);
  }



}
const num = (x: any) => (x == null || x === "" ? undefined : Number(x));
