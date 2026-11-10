import { prisma } from "../prisma";
import { sendWeeklyResponderReports } from "../services/responderWeeklyReport.service";

async function main() {
  const result = await sendWeeklyResponderReports();
  console.info(`Responder reports completed: ${result.dailySent} daily and ${result.weeklySent} weekly sent from ${result.eligible} eligible accounts.`);
}

main()
  .catch((error) => {
    console.error("Weekly responder report failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
