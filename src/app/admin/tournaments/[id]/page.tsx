import { ManageView } from "./manage-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Manage Tournament | RAJA GAMING Admin" };

export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManageView tournamentId={id} />;
}
