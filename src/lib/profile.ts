/** Shared helpers for the public face of an account: its photo URL and short description. */

export const ownerProfileSelect = { select: { id: true, bio: true, avatarUpdatedAt: true } } as const;

type Owner = { id: string; bio: string | null; avatarUpdatedAt: Date | null };

/** The version in the query string busts caches whenever the photo changes. */
export function avatarUrl(userId: string, avatarUpdatedAt: Date | null): string | null {
  return avatarUpdatedAt ? `/profile/avatar/${userId}?v=${avatarUpdatedAt.getTime()}` : null;
}

/** Folds the owning account's photo + description into a merchant payload (and drops the raw `user`). */
export function withOwnerProfile<T extends { user?: Owner | null }>(merchant: T) {
  const { user, ...rest } = merchant;
  return { ...rest, bio: user?.bio ?? null, avatarUrl: user ? avatarUrl(user.id, user.avatarUpdatedAt) : null };
}
