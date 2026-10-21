-- The admin can say "this shop is not the same place as that public place", so the pair is not offered again
ALTER TABLE "Landmark" ADD COLUMN "duplicateDismissed" BOOLEAN NOT NULL DEFAULT false;
