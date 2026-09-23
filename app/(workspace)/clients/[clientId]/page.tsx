import { notFound } from "next/navigation";
import { ClientDetailView } from "@/components/clients/client-detail-view";
import { PageContainer } from "@/components/layout/page-container";
import { getClientDetail } from "@/lib/queries/clients";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await getClientDetail(clientId);
  return { title: client?.name ?? "Client" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await getClientDetail(clientId);
  if (!client) notFound();

  return (
    <PageContainer>
      <ClientDetailView client={client} />
    </PageContainer>
  );
}
