import { prisma } from "../lib/prisma";

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-couple" },
    update: {},
    create: {
      slug: "demo-couple",
      name: "PairNest",
      anniversary: new Date("2026-03-04T00:00:00.000Z"),
      partners: {
        create: [
          { role: "A", name: "Alex" },
          { role: "B", name: "Jamie" }
        ]
      }
    }
  });

  await prisma.partner.upsert({
    where: { workspaceId_role: { workspaceId: workspace.id, role: "A" } },
    update: { name: "Alex" },
    create: { workspaceId: workspace.id, role: "A", name: "Alex" }
  });
  await prisma.partner.upsert({
    where: { workspaceId_role: { workspaceId: workspace.id, role: "B" } },
    update: { name: "Jamie" },
    create: { workspaceId: workspace.id, role: "B", name: "Jamie" }
  });

  const existingWishlist = await prisma.wishlistItem.count({ where: { workspaceId: workspace.id } });
  if (!existingWishlist) {
    await prisma.wishlistItem.createMany({
      data: [
        {
          workspaceId: workspace.id,
          title: "Kyoto autumn trip",
          category: "Travel",
          priority: "High",
          addedBy: "Both",
          status: "Saved",
          note: "Check ryokan availability and foliage timing."
        },
        {
          workspaceId: workspace.id,
          title: "Anniversary dinner shortlist",
          category: "Restaurant",
          priority: "Medium",
          addedBy: "Alex",
          status: "Saved",
          note: "Somewhere quiet with a tasting menu."
        }
      ]
    });
  }

  const existingGoals = await prisma.goal.count({ where: { workspaceId: workspace.id } });
  if (!existingGoals) {
    await prisma.goal.createMany({
      data: [
        {
          workspaceId: workspace.id,
          title: "Build a shared travel fund",
          type: "Finance",
          status: "In progress",
          owner: "Both",
          progress: 35,
          targetDate: new Date("2026-12-31T00:00:00.000Z"),
          note: "Automate monthly transfer after payday."
        },
        {
          workspaceId: workspace.id,
          title: "Learn basic Japanese together",
          type: "Learning",
          status: "Planned",
          owner: "Jamie",
          progress: 10,
          targetDate: new Date("2026-09-01T00:00:00.000Z")
        }
      ]
    });
  }

  const existingEvents = await prisma.event.count({ where: { workspaceId: workspace.id } });
  if (!existingEvents) {
    await prisma.event.createMany({
      data: [
        {
          workspaceId: workspace.id,
          title: "Friday dinner hold",
          start: new Date("2026-07-03T12:30:00.000Z"),
          end: new Date("2026-07-03T14:00:00.000Z"),
          source: "SHARED",
          note: "Confirm reservation."
        },
        {
          workspaceId: workspace.id,
          title: "Apartment viewing",
          start: new Date("2026-07-08T10:00:00.000Z"),
          end: new Date("2026-07-08T11:00:00.000Z"),
          source: "A",
          note: "Bring documents."
        }
      ]
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
