/**
 * Database seed script.
 * Creates the default user, settings, and seed resume versions.
 * Run: npm run db:seed
 */
import { prisma } from './db'
import { getEnv } from './env'
import type { ResumeContent } from '@/src/types'

async function main() {
  const env = getEnv()

  // Create default user
  const user = await prisma.user.upsert({
    where: { email: env.GMAIL_USER_EMAIL ?? 'user@example.com' },
    update: {},
    create: {
      email: env.GMAIL_USER_EMAIL ?? 'user@example.com',
      name: 'Job Hunter',
    },
  })

  console.log('Created user:', user.id)

  // Create default settings
  await prisma.settings.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      autoApply: false,
      autoFollowup: false,
      maxDailyApplications: 20,
      followupDelayDays: 7,
      minFitScore: 0.60,
    },
  })

  // Seed resume versions
  const reactResume: ResumeContent = {
    name: 'Your Name',
    email: env.GMAIL_USER_EMAIL ?? 'user@example.com',
    phone: '+1 (555) 000-0000',
    location: 'Remote',
    summary: 'Frontend developer specializing in React, Next.js, and TypeScript with 2+ years building production web applications. Passionate about performance, clean code, and great UX.',
    skills: ['React', 'Next.js', 'TypeScript', 'JavaScript', 'Tailwind CSS', 'Node.js', 'REST APIs', 'Git', 'PostgreSQL', 'MongoDB'],
    experience: [
      {
        company: 'Previous Company',
        title: 'Frontend Developer',
        startDate: '2023-01',
        endDate: '2024-12',
        bullets: [
          'Built and maintained React components used by 50K+ monthly users',
          'Reduced page load time by 40% through code splitting and lazy loading',
          'Collaborated with design team to implement pixel-perfect UI from Figma',
          'Wrote comprehensive unit tests with Jest and React Testing Library',
        ],
        skills: ['React', 'TypeScript', 'Tailwind CSS', 'Jest'],
      },
    ],
    education: [
      {
        institution: 'University Name',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        graduationYear: 2022,
      },
    ],
    projects: [
      {
        name: 'E-Commerce Platform',
        description: 'Full-stack Next.js application with Stripe payments, auth, and real-time inventory',
        url: 'https://github.com/username/project',
        skills: ['Next.js', 'TypeScript', 'Stripe', 'PostgreSQL', 'Prisma'],
        bullets: [
          'Implemented server-side rendering for SEO optimization',
          'Built complete payment flow with Stripe webhooks',
        ],
      },
    ],
    links: { github: 'github.com/username', linkedin: 'linkedin.com/in/username' },
  }

  const resumeTypes: Array<{ name: string; type: string }> = [
    { name: 'react_resume', type: 'react' },
    { name: 'frontend_resume', type: 'frontend' },
    { name: 'fullstack_resume', type: 'fullstack' },
    { name: 'junior_ai_resume', type: 'junior_ai' },
  ]

  for (const rt of resumeTypes) {
    const existing = await prisma.resumeVersion.findFirst({
      where: { userId: user.id, name: rt.name },
    })

    if (!existing) {
      await prisma.resumeVersion.create({
        data: {
          userId: user.id,
          name: rt.name,
          type: rt.type,
          content: {
            ...reactResume,
            summary: `${rt.type === 'junior_ai' ? 'AI-focused' : rt.type} developer with React, TypeScript and Node.js expertise. ${reactResume.summary}`,
          } as never,
          version: 1,
        },
      })
      console.log('Created resume:', rt.name)
    }
  }

  console.log('Seed complete!')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
