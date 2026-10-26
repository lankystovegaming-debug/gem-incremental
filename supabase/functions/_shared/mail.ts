/** Trusted backend callers only. Reuse requestId for every retry of one delivery. */
export async function publishSystemMail(
  serviceClient: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  mail: {
    requestId: string;
    subject: string;
    body: string;
    rewards?: Array<{ type: 'money' | 'coins' | 'potion'; amount: number; consumableId?: string }>;
    audience?: 'player' | 'all';
    recipient?: string;
    sender?: string;
    expiresAt?: string; // ISO timestamp. Omit for seven days from publication.
  }
) {
  const { data, error } = await serviceClient.rpc('publish_system_mail', {
    p_request_id: mail.requestId,
    p_subject: mail.subject,
    p_body: mail.body,
    p_rewards: mail.rewards ?? [],
    p_audience: mail.audience ?? 'player',
    p_recipient: mail.recipient ?? null,
    p_sender: mail.sender ?? 'System',
    p_expires_at: mail.expiresAt ?? null
  });
  if (error) throw error;
  return data;
}
