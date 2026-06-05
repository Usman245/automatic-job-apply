import { z } from "zod";
import { getAnthropic } from "@/src/lib/anthropic";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/src/lib/db";
import { logger } from "@/src/lib/logger";
import { generateEmbedding } from "./job-scoring";
import type { ResumeContent, ToolResult } from "@/src/types";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const FindMatchingResumeInput = z.object({
  jobId: z.string().cuid(),
  userId: z.string().cuid(),
});

export const SimilarResumeSearchInput = z.object({
  jobDescription: z.string().min(10),
  limit: z.number().int().min(1).max(10).default(3),
});

export const CustomizeResumeInput = z.object({
  resumeVersionId: z.string().cuid(),
  jobId: z.string().cuid(),
  userId: z.string().cuid(),
});

export const GenerateResumePdfInput = z.object({
  resumeVersionId: z.string().cuid(),
});

// ─── Implementations ──────────────────────────────────────────────────────────

export async function findMatchingResume(
  input: z.infer<typeof FindMatchingResumeInput>,
): Promise<
  ToolResult<{
    resumeVersionId: string;
    confidence: "low" | "medium" | "high";
    name: string;
  }>
> {
  const log = logger.child({
    tool: "find_matching_resume",
    jobId: input.jobId,
  });

  try {
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: input.jobId },
    });
    const resumes = await prisma.resumeVersion.findMany({
      where: { userId: input.userId, isActive: true },
    });

    if (resumes.length === 0) {
      return { success: false, error: "No active resume versions found" };
    }

    // Use role type to pick the best matching resume type
    const roleTypeLower = (job.roleType ?? job.title).toLowerCase();
    const typePriority: Record<string, string[]> = {
      frontend: ["frontend", "react", "fullstack"],
      react: ["react", "frontend", "fullstack"],
      fullstack: ["fullstack", "mern", "react", "frontend"],
      junior_ai: ["junior_ai", "fullstack", "react"],
      mern: ["mern", "fullstack", "react"],
    };

    let bestType = "fullstack";
    if (
      roleTypeLower.includes("react") ||
      roleTypeLower.includes("frontend") ||
      roleTypeLower.includes("ui")
    ) {
      bestType = "react";
    } else if (roleTypeLower.includes("ai") || roleTypeLower.includes("ml")) {
      bestType = "junior_ai";
    } else if (roleTypeLower.includes("full")) {
      bestType = "fullstack";
    }

    const prioritized = typePriority[bestType] ?? ["fullstack"];
    let best = resumes.find((r) => r.type === prioritized[0]);
    if (!best) best = resumes.find((r) => r.type === prioritized[1]);
    if (!best) best = resumes[0];

    const confidence =
      best.type === prioritized[0]
        ? "high"
        : best.type === prioritized[1]
          ? "medium"
          : "low";

    log.info({ resumeId: best.id, confidence }, "matched resume");
    return {
      success: true,
      data: { resumeVersionId: best.id, confidence, name: best.name },
    };
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err: message }, "find_matching_resume failed");
    return { success: false, error: message };
  }
}

export async function similarResumeSearch(
  input: z.infer<typeof SimilarResumeSearchInput>,
): Promise<
  ToolResult<
    Array<{ id: string; name: string; type: string; similarity: number }>
  >
> {
  try {
    const embedding = await generateEmbedding(input.jobDescription);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const results = await prisma.$queryRaw<
      Array<{ id: string; name: string; type: string; similarity: number }>
    >`
      SELECT rv.id, rv.name, rv.type,
             1 - (re.embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "ResumeEmbedding" re
      JOIN "ResumeVersion" rv ON rv.id = re."resumeVersionId"
      WHERE rv."isActive" = true
      ORDER BY re.embedding <=> ${vectorLiteral}::vector
      LIMIT ${input.limit}
    `;

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function customizeResume(
  input: z.infer<typeof CustomizeResumeInput>,
): Promise<ToolResult<{ resumeVersionId: string; matchScore: number }>> {
  const log = logger.child({ tool: "customize_resume", ...input });

  try {
    const [resume, job] = await Promise.all([
      prisma.resumeVersion.findUniqueOrThrow({
        where: { id: input.resumeVersionId },
      }),
      prisma.job.findUniqueOrThrow({ where: { id: input.jobId } }),
    ]);

    const content = resume.content as unknown as ResumeContent;

    const prompt = `You are a professional resume optimizer. Customize this resume for the job below.

STRICT RULES:
- Never fabricate experience, skills, or credentials
- Never add jobs, projects, or education that don't exist
- Only reorder, reword, and emphasize existing content
- Only optimize for ATS and keyword relevance
- Output valid JSON only matching the exact input structure

Job Title: ${job.title}
Company: ${job.company}
Required Skills: ${job.requiredSkills?.join(", ")}
Job Description (excerpt): ${job.description.slice(0, 2000)}

Current Resume JSON:
${JSON.stringify(content, null, 2)}`;

    const message = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in customization response");

    const customized: ResumeContent = JSON.parse(jsonMatch[0]);

    // Save as a new version so original is preserved
    const newVersion = await prisma.resumeVersion.create({
      data: {
        userId: input.userId,
        name: `${resume.name}_${job.company.replace(/\s+/g, "_").slice(0, 20)}`,
        type: resume.type,
        content: customized as never,
        version: resume.version + 1,
        isActive: true,
      },
    });

    // Embed the new version
    const embeddingText = `${customized.summary} ${customized.skills.join(" ")}`;
    const embedding = await generateEmbedding(embeddingText);
    const vectorLiteral = `[${embedding.join(",")}]`;

    await prisma.$executeRaw`
      INSERT INTO "ResumeEmbedding" (id, "resumeVersionId", embedding, "createdAt")
      VALUES (gen_random_uuid(), ${newVersion.id}, ${vectorLiteral}::vector, now())
    `;

    const matchScore = job.fitScore ?? 0.7;
    log.info({ newId: newVersion.id, matchScore }, "resume customized");
    return {
      success: true,
      data: { resumeVersionId: newVersion.id, matchScore },
    };
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err: message }, "customize_resume failed");
    return { success: false, error: message };
  }
}

export async function generateResumePdf(
  input: z.infer<typeof GenerateResumePdfInput>,
): Promise<ToolResult<{ pdfPath: string }>> {
  const log = logger.child({
    tool: "generate_resume_pdf",
    id: input.resumeVersionId,
  });

  try {
    const resume = await prisma.resumeVersion.findUniqueOrThrow({
      where: { id: input.resumeVersionId },
    });
    const content = resume.content as unknown as ResumeContent;

    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const { height } = page.getSize();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;
    const margin = 50;
    const lineH = 16;

    const write = (text: string, size = 11, bold = false, indent = 0) => {
      if (y < 60) return;
      page.drawText(text.slice(0, 90), {
        x: margin + indent,
        y,
        size,
        font: bold ? fontBold : font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineH;
    };

    write(content.name, 20, true);
    write(
      `${content.email}${content.phone ? " | " + content.phone : ""}${content.location ? " | " + content.location : ""}`,
      10,
    );
    y -= 8;

    write("SUMMARY", 12, true);
    y -= 4;
    // Word-wrap summary
    const words = content.summary.split(" ");
    let line = "";
    for (const word of words) {
      if ((line + word).length > 85) {
        write(line.trim(), 10);
        line = word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim()) write(line.trim(), 10);
    y -= 8;

    write("SKILLS", 12, true);
    y -= 4;
    write(content.skills.join(" • "), 10);
    y -= 8;

    write("EXPERIENCE", 12, true);
    y -= 4;
    for (const exp of content.experience) {
      write(`${exp.title} — ${exp.company}`, 11, true);
      write(`${exp.startDate} – ${exp.endDate ?? "Present"}`, 10);
      for (const bullet of exp.bullets.slice(0, 4)) {
        write(`• ${bullet}`, 10, false, 10);
      }
      y -= 6;
    }

    write("PROJECTS", 12, true);
    y -= 4;
    for (const proj of content.projects.slice(0, 3)) {
      write(`${proj.name}${proj.url ? " — " + proj.url : ""}`, 11, true);
      write(proj.description.slice(0, 100), 10);
      y -= 4;
    }

    write("EDUCATION", 12, true);
    y -= 4;
    for (const edu of content.education) {
      write(
        `${edu.degree} in ${edu.field} — ${edu.institution} (${edu.graduationYear})`,
        10,
      );
    }

    const pdfBytes = await doc.save();
    const outDir = path.join(process.cwd(), "public", "resumes");
    await fs.mkdir(outDir, { recursive: true });
    const pdfPath = path.join(outDir, `${input.resumeVersionId}.pdf`);
    await fs.writeFile(pdfPath, pdfBytes);

    await prisma.resumeVersion.update({
      where: { id: input.resumeVersionId },
      data: { pdfPath: `/resumes/${input.resumeVersionId}.pdf` },
    });

    log.info({ pdfPath }, "PDF generated");
    return { success: true, data: { pdfPath } };
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err: message }, "generate_resume_pdf failed");
    return { success: false, error: message };
  }
}
