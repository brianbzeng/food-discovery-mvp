import type { Metadata } from "next";
import { PartyPlanner } from "./party-planner";

export const metadata: Metadata = {
  title: "Find something for everyone",
  description:
    "Create a private food plan, invite friends, and find local restaurants that work for everyone's saved preferences.",
};

export default function PartyPage() {
  return <PartyPlanner />;
}
