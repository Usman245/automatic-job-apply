import type Anthropic from '@anthropic-ai/sdk'

// ─── Tool Definitions for Claude ──────────────────────────────────────────────
// Claude receives these as metadata. Real execution happens in executeToolCall().

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // Job Discovery
  {
    name: 'search_jobs_tool',
    description: 'Search for remote job listings across job platforms. Returns a list of raw job postings.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Job search query e.g. "React Developer remote"' },
        platform: {
          type: 'string',
          enum: ['linkedin', 'indeed', 'greenhouse', 'lever', 'workable', 'wellfound', 'all'],
          description: 'Platform to search. Use "all" for broadest coverage.',
        },
        maxResults: { type: 'number', description: 'Max results per platform (1-50)', default: 20 },
        remoteOnly: { type: 'boolean', description: 'Filter to remote jobs only', default: true },
      },
      required: ['query'],
    },
  },
  {
    name: 'extract_job_details_tool',
    description: 'Scrape and extract full job details (description, requirements, apply URL) from a job posting URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the job posting' },
        platform: {
          type: 'string',
          enum: ['linkedin', 'indeed', 'greenhouse', 'lever', 'workable', 'wellfound', 'other'],
        },
      },
      required: ['url', 'platform'],
    },
  },
  {
    name: 'deduplicate_jobs_tool',
    description: 'Check if a job already exists in the database to prevent re-processing.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['url', 'title', 'company'],
    },
  },

  // Job Scoring
  {
    name: 'score_job_tool',
    description: 'Analyze a job posting for fit with the user profile. Returns fitScore, shouldApply decision, and skill gap analysis.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Database ID of the job to score' },
        userSkills: { type: 'array', items: { type: 'string' }, description: 'Override user skills list' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'classify_job_tool',
    description: 'Classify a job title/description into role type and seniority level.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'embed_job_description_tool',
    description: 'Create and store a vector embedding for a job description to enable similarity search.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },

  // Resume
  {
    name: 'find_matching_resume_tool',
    description: 'Find the best matching resume version for a given job based on role type.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['jobId', 'userId'],
    },
  },
  {
    name: 'similar_resume_search_tool',
    description: 'Use vector similarity to find resumes that best match a job description.',
    input_schema: {
      type: 'object',
      properties: {
        jobDescription: { type: 'string' },
        limit: { type: 'number', default: 3 },
      },
      required: ['jobDescription'],
    },
  },
  {
    name: 'customize_resume_tool',
    description: 'Generate a customized version of a resume optimized for a specific job. Never fabricates experience.',
    input_schema: {
      type: 'object',
      properties: {
        resumeVersionId: { type: 'string' },
        jobId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['resumeVersionId', 'jobId', 'userId'],
    },
  },
  {
    name: 'generate_resume_pdf_tool',
    description: 'Generate a PDF file from a resume version. Required before submitting applications.',
    input_schema: {
      type: 'object',
      properties: { resumeVersionId: { type: 'string' } },
      required: ['resumeVersionId'],
    },
  },

  // Communication
  {
    name: 'generate_cover_letter_tool',
    description: 'Generate a tailored cover letter for a job application.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        resumeVersionId: { type: 'string' },
        tone: { type: 'string', enum: ['formal', 'conversational'], default: 'formal' },
      },
      required: ['jobId', 'resumeVersionId'],
    },
  },
  {
    name: 'generate_short_application_response_tool',
    description: 'Generate a short, honest answer to a screening question (e.g., "Why do you want to work here?").',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        prompt: { type: 'string', description: 'The question to answer' },
        maxWords: { type: 'number', default: 150 },
      },
      required: ['jobId', 'prompt'],
    },
  },
  {
    name: 'gmail_apply_tool',
    description: 'Send a job application email with resume attachment via Gmail API.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        resumeVersionId: { type: 'string' },
        toEmail: { type: 'string' },
        subject: { type: 'string' },
      },
      required: ['jobId', 'resumeVersionId', 'toEmail'],
    },
  },
  {
    name: 'schedule_followup_tool',
    description: 'Schedule a follow-up email for a submitted application.',
    input_schema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string' },
        delayDays: { type: 'number', default: 7 },
      },
      required: ['applicationId'],
    },
  },
  {
    name: 'send_followup_tool',
    description: 'Send a scheduled follow-up email for a job application.',
    input_schema: {
      type: 'object',
      properties: { followupId: { type: 'string' } },
      required: ['followupId'],
    },
  },

  // Application Engine
  {
    name: 'linkedin_apply_tool',
    description: 'Apply to a job via LinkedIn Easy Apply using Playwright automation.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        resumeVersionId: { type: 'string' },
        workflowId: { type: 'string' },
      },
      required: ['jobId', 'resumeVersionId', 'workflowId'],
    },
  },
  {
    name: 'ats_apply_tool',
    description: 'Apply to a job via an ATS platform (Greenhouse, Lever, Workday, Workable).',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        resumeVersionId: { type: 'string' },
        platform: { type: 'string', enum: ['greenhouse', 'lever', 'workday', 'workable'] },
        workflowId: { type: 'string' },
      },
      required: ['jobId', 'resumeVersionId', 'platform', 'workflowId'],
    },
  },
  {
    name: 'answer_screening_questions_tool',
    description: 'Generate honest answers to job application screening questions.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
      },
      required: ['jobId', 'questions'],
    },
  },
  {
    name: 'captcha_detect_tool',
    description: 'Signal that a CAPTCHA has been detected. Pauses workflow and notifies user for manual resolution.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        url: { type: 'string' },
        platform: { type: 'string' },
      },
      required: ['workflowId', 'url', 'platform'],
    },
  },

  // Workflow
  {
    name: 'pause_workflow_tool',
    description: 'Pause the current workflow and save state for later resumption.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        reason: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['workflowId', 'reason'],
    },
  },
  {
    name: 'resume_workflow_tool',
    description: 'Resume a previously paused workflow.',
    input_schema: {
      type: 'object',
      properties: { workflowId: { type: 'string' } },
      required: ['workflowId'],
    },
  },
  {
    name: 'save_application_tool',
    description: 'Save a job application record to the database.',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        jobId: { type: 'string' },
        resumeVersionId: { type: 'string' },
        platform: { type: 'string' },
        coverLetter: { type: 'string' },
      },
      required: ['userId', 'jobId', 'resumeVersionId', 'platform'],
    },
  },
  {
    name: 'update_application_status_tool',
    description: 'Update the status of a job application.',
    input_schema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['PENDING', 'APPLYING', 'APPLIED', 'VIEWED', 'ASSESSMENT', 'INTERVIEW', 'GHOSTED', 'REJECTED', 'OFFER', 'WITHDRAWN'],
        },
        data: { type: 'object' },
      },
      required: ['applicationId', 'status'],
    },
  },

  // Memory
  {
    name: 'embed_application_tool',
    description: 'Create and store a vector embedding for a job application for future learning.',
    input_schema: {
      type: 'object',
      properties: { applicationId: { type: 'string' } },
      required: ['applicationId'],
    },
  },
  {
    name: 'retrieve_memory_tool',
    description: 'Retrieve relevant past jobs, resumes, and applications using semantic similarity. Use to learn from past successes.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "successful React applications"' },
        type: { type: 'string', enum: ['jobs', 'resumes', 'applications', 'all'], default: 'all' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },

  // System
  {
    name: 'log_activity_tool',
    description: 'Log an agent activity, decision, or error to the audit trail.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        type: { type: 'string', enum: ['tool_call', 'decision', 'error', 'retry', 'captcha', 'workflow'] },
        tool: { type: 'string' },
        message: { type: 'string' },
        data: { type: 'object' },
        duration: { type: 'number' },
      },
      required: ['level', 'type', 'message'],
    },
  },
  {
    name: 'notify_user_tool',
    description: 'Send a notification to the user about an important event.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        message: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['type', 'title', 'message'],
    },
  },
]

// ─── Tool Executor ─────────────────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  const start = Date.now()

  switch (toolName) {
    // Job Discovery
    case 'search_jobs_tool': {
      const { searchJobs, SearchJobsInput } = await import('./job-discovery')
      return searchJobs(SearchJobsInput.parse(toolInput))
    }
    case 'extract_job_details_tool': {
      const { extractJobDetails, ExtractJobDetailsInput } = await import('./job-discovery')
      return extractJobDetails(ExtractJobDetailsInput.parse(toolInput))
    }
    case 'deduplicate_jobs_tool': {
      const { deduplicateJob, DeduplicateJobInput } = await import('./job-discovery')
      return deduplicateJob(DeduplicateJobInput.parse(toolInput))
    }

    // Job Scoring
    case 'score_job_tool': {
      const { scoreJob, ScoreJobInput } = await import('./job-scoring')
      return scoreJob(ScoreJobInput.parse(toolInput))
    }
    case 'classify_job_tool': {
      const { classifyJob, ClassifyJobInput } = await import('./job-scoring')
      return classifyJob(ClassifyJobInput.parse(toolInput))
    }
    case 'embed_job_description_tool': {
      const { embedJob, EmbedJobInput } = await import('./job-scoring')
      return embedJob(EmbedJobInput.parse(toolInput))
    }

    // Resume
    case 'find_matching_resume_tool': {
      const { findMatchingResume, FindMatchingResumeInput } = await import('./resume')
      return findMatchingResume(FindMatchingResumeInput.parse(toolInput))
    }
    case 'similar_resume_search_tool': {
      const { similarResumeSearch, SimilarResumeSearchInput } = await import('./resume')
      return similarResumeSearch(SimilarResumeSearchInput.parse(toolInput))
    }
    case 'customize_resume_tool': {
      const { customizeResume, CustomizeResumeInput } = await import('./resume')
      return customizeResume(CustomizeResumeInput.parse(toolInput))
    }
    case 'generate_resume_pdf_tool': {
      const { generateResumePdf, GenerateResumePdfInput } = await import('./resume')
      return generateResumePdf(GenerateResumePdfInput.parse(toolInput))
    }

    // Communication
    case 'generate_cover_letter_tool': {
      const { generateCoverLetter, GenerateCoverLetterInput } = await import('./communication')
      return generateCoverLetter(GenerateCoverLetterInput.parse(toolInput))
    }
    case 'generate_short_application_response_tool': {
      const { generateShortResponse, GenerateShortResponseInput } = await import('./communication')
      return generateShortResponse(GenerateShortResponseInput.parse(toolInput))
    }
    case 'gmail_apply_tool': {
      const { gmailApply, GmailApplyInput } = await import('./communication')
      return gmailApply(GmailApplyInput.parse(toolInput))
    }
    case 'schedule_followup_tool': {
      const { scheduleFollowup, ScheduleFollowupInput } = await import('./communication')
      return scheduleFollowup(ScheduleFollowupInput.parse(toolInput))
    }
    case 'send_followup_tool': {
      const { sendFollowup, SendFollowupInput } = await import('./communication')
      return sendFollowup(SendFollowupInput.parse(toolInput))
    }

    // Application
    case 'linkedin_apply_tool': {
      const { linkedinApply, LinkedInApplyInput } = await import('./application')
      return linkedinApply(LinkedInApplyInput.parse(toolInput))
    }
    case 'ats_apply_tool': {
      const { atsApply, AtsApplyInput } = await import('./application')
      return atsApply(AtsApplyInput.parse(toolInput))
    }
    case 'answer_screening_questions_tool': {
      const { answerScreeningQuestions, AnswerScreeningQuestionsInput } = await import('./application')
      return answerScreeningQuestions(AnswerScreeningQuestionsInput.parse(toolInput))
    }
    case 'captcha_detect_tool': {
      const { captchaDetect, CaptchaDetectInput } = await import('./application')
      return captchaDetect(CaptchaDetectInput.parse(toolInput))
    }

    // Workflow
    case 'pause_workflow_tool': {
      const { pauseWorkflow, PauseWorkflowInput } = await import('./workflow')
      return pauseWorkflow(PauseWorkflowInput.parse(toolInput))
    }
    case 'resume_workflow_tool': {
      const { resumeWorkflow, ResumeWorkflowInput } = await import('./workflow')
      return resumeWorkflow(ResumeWorkflowInput.parse(toolInput))
    }
    case 'save_application_tool': {
      const { saveApplication, SaveApplicationInput } = await import('./workflow')
      return saveApplication(SaveApplicationInput.parse(toolInput))
    }
    case 'update_application_status_tool': {
      const { updateApplicationStatus, UpdateApplicationStatusInput } = await import('./workflow')
      return updateApplicationStatus(UpdateApplicationStatusInput.parse(toolInput))
    }

    // Memory
    case 'embed_application_tool': {
      const { embedApplication, EmbedApplicationInput } = await import('./memory')
      return embedApplication(EmbedApplicationInput.parse(toolInput))
    }
    case 'retrieve_memory_tool': {
      const { retrieveMemory, RetrieveMemoryInput } = await import('./memory')
      return retrieveMemory(RetrieveMemoryInput.parse(toolInput))
    }

    // System
    case 'log_activity_tool': {
      const { logActivity, LogActivityInput } = await import('./system')
      return logActivity(LogActivityInput.parse(toolInput))
    }
    case 'notify_user_tool': {
      const { notifyUser, NotifyUserInput } = await import('./system')
      return notifyUser(NotifyUserInput.parse(toolInput))
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` }
  }
}
