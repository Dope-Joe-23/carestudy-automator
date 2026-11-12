import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, ExternalLink, FileText, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type PolicyPageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function PolicyPage({ title, description, children }: PolicyPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/chat"><ArrowLeft className="size-4" /> Back to chat</Link>
          </Button>
          <Link href="/" className="text-sm font-semibold text-primary hover:underline">
            CareStudy · Nursuit
          </Link>
        </div>

        <header className="mb-8">
          <p className="text-sm font-medium text-primary">Draft for review</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link className="rounded-full border px-3 py-1.5 hover:bg-accent" href="/ai-data-use">AI &amp; data use</Link>
            <Link className="rounded-full border px-3 py-1.5 hover:bg-accent" href="/privacy">Privacy</Link>
            <Link className="rounded-full border px-3 py-1.5 hover:bg-accent" href="/terms">Terms</Link>
          </div>
        </header>

        <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6">
          <p className="font-semibold">Publication checks remain</p>
          <p className="mt-1 text-muted-foreground">
            This draft reflects the application behavior and local configuration reviewed on 12 November 2026.
            Confirm the production provider settings, legal operator name and contact details, retention and
            backup arrangements, and Ghana-specific legal wording before treating it as a final policy.
          </p>
        </div>

        <article className="space-y-8 text-sm leading-7 sm:text-base [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p+p]:mt-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </article>
      </div>
    </main>
  );
}

function PublicationTodo({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4 text-sm leading-6 text-muted-foreground">
      <span className="font-semibold text-foreground">Before publication: </span>
      {children}
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      description="How CareStudy and the Nursuit chatspace handle account information, conversations, and uploaded study documents."
    >
      <section>
        <h2>Who operates the service</h2>
        <p>
          CareStudy and Nursuit are the names used for this service. The legal identity of the operator and its
          privacy contact have not yet been provided for this draft.
        </p>
        <PublicationTodo>
          Add the operator's registered legal name, address, and a monitored privacy-contact email or other
          request channel.
        </PublicationTodo>
      </section>

      <section>
        <h2>Information handled</h2>
        <p>
          The service handles account and profile information needed to provide student features, messages and
          answers in chat, conversation references, and the filenames of documents attached to saved chats.
          Information in an uploaded document may include personal or health information about someone other
          than the uploader.
        </p>
        <p>
          When you attach a file, the application server receives it to extract readable text. The extracted
          text, your prompt, and recent conversation context are sent to the configured AI gateway to generate
          a response. The uploaded file's binary contents are not part of the saved chat message record.
        </p>
      </section>

      <section>
        <h2>AI providers and web search</h2>
        <p>
          The current application configuration uses OpenRouter as an AI gateway. OpenRouter may route a request
          to a model provider; provider and endpoint data practices can differ and may change. The application
          does not currently enforce a provider allowlist or a zero-data-retention requirement in its model
          request. We therefore do not promise that every upstream provider retains no data or never uses data
          for model improvement.
        </p>
        <p>
          OpenRouter states that it does not use inputs or outputs for its own model training, while its
          documentation explains that upstream provider policies vary. Review the current{" "}
          <a href="https://openrouter.ai/privacy" target="_blank" rel="noreferrer">OpenRouter Privacy Policy</a>
          {" "}and{" "}
          <a href="https://openrouter.ai/docs/guides/privacy/provider-logging" target="_blank" rel="noreferrer">
            provider data policies
          </a>
          . These statements describe OpenRouter's published policies, not a guarantee about every routed
          provider or this service's account settings.
        </p>
        <p>
          If you turn on web search, the search query is sent to Brave Search. Search results are then supplied
          to the AI request as background material.
        </p>
      </section>

      <section>
        <h2>Chat history and deletion</h2>
        <p>
          Guest conversations are not saved to the service's student chat history. For signed-in students,
          messages and answers are saved to the account's chat history, together with attachment filenames.
          Students can delete saved conversations from the chat sidebar.
        </p>
        <p>
          Deleting a conversation removes that saved chat record from the application. It does not recall a
          prompt already sent to an AI provider or establish deletion from provider systems, operational logs,
          or backups. The retention periods for those separate systems have not been established in this draft.
        </p>
      </section>

      <section>
        <h2>Security, retention, and requests</h2>
        <p>
          The app's saved-chat behavior is described above. Exact retention periods for infrastructure logs,
          backups, and provider-side data are not confirmed here, and this draft does not claim zero retention.
          Use only data you are authorized to submit, and follow your school or care organization's rules for
          patient information.
        </p>
        <PublicationTodo>
          Document verified security controls, log and backup retention, the process and response times for
          privacy requests, and applicable Ghana data-protection requirements. Do not publish unverified
          security or deletion guarantees.
        </PublicationTodo>
      </section>

      <section>
        <h2>Changes and questions</h2>
        <p>
          Update this page when the production provider, routing, storage, or user-facing data practices change.
          Use the operator contact details added before publication to ask questions or make a privacy request.
        </p>
      </section>
    </PolicyPage>
  );
}

export function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Use"
      description="Draft terms for using CareStudy and the Nursuit chatspace for nursing education and academic support."
    >
      <section>
        <h2>Operator and acceptance</h2>
        <p>
          These draft terms apply to use of the CareStudy/Nursuit service. The legal identity and contact details
          of the service operator must be completed before publication. By using the service after final terms
          are published, users will be expected to follow those terms and applicable laws.
        </p>
      </section>

      <section>
        <h2>Educational service, not clinical direction</h2>
        <p>
          The chatspace provides educational and academic assistance. AI-generated content can be incomplete,
          incorrect, or unsupported. Review it against course requirements and reliable sources. It is not a
          diagnosis, prescription, clinical instruction, or substitute for decisions by a qualified professional.
          Do not use the service to direct urgent or actual patient care.
        </p>
      </section>

      <section>
        <h2>Accounts and conversations</h2>
        <p>
          Keep account credentials secure and provide accurate information when creating an account. Signed-in
          chat messages and answers are saved to chat history until the conversation is deleted using the
          available controls. Guest chats are not saved to the student chat history.
        </p>
      </section>

      <section>
        <h2>Documents and acceptable use</h2>
        <p>
          Upload only documents you are permitted to share and use. Remove or mask patient-identifying details
          unless you have authorization and your institution's rules permit submission. Do not use the service
          to disclose information unlawfully, infringe another person's rights, or bypass security controls.
        </p>
        <p>
          Uploaded text may be sent to third-party AI providers to produce a response. See the{" "}
          <Link href="/ai-data-use">AI &amp; Data Use Notice</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link> for the current described data flow.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          AI processing is provided through the gateway configured for the service and may involve model
          providers with their own terms and data practices. Optional web search uses Brave Search. Availability
          and provider behavior may change; the service cannot guarantee uninterrupted access or a particular
          model response.
        </p>
      </section>

      <section>
        <h2>Orders, payments, and other terms</h2>
        <p>
          If you place an order or make a payment, the price and any applicable transaction-specific terms shown
          during checkout also apply. This draft does not set refund, cancellation, ownership, or liability terms;
          those must be confirmed by the operator and reviewed before publication.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>
          Ghana is the intended governing jurisdiction for these terms. The final governing-law, venue, dispute,
          consumer-protection, and enforceability wording must be reviewed by qualified Ghanaian counsel before
          publication.
        </p>
      </section>
      <PublicationTodo>
        Complete the legal operator identity and contact information, and obtain legal review of the final terms,
        especially payments, user content, liability, disputes, and applicable Ghanaian law.
      </PublicationTodo>
    </PolicyPage>
  );
}

export function AiDataUsePage() {
  return (
    <PolicyPage
      title="AI & Data Use Notice"
      description="A plain-language summary of what happens when you ask Nursuit to work with a question or uploaded document."
    >
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-1 size-5 shrink-0 text-primary" />
          <p>
            <strong>In short:</strong> Prompts, recent chat context, and extracted document text are sent through
            the AI gateway configured for this service. Signed-in chats are saved in your account until you
            delete them. A routed model provider may have separate data practices.
          </p>
        </div>
      </section>

      <section>
        <h2>When you attach a document</h2>
        <ul>
          <li>The selected file is sent to the application server for text extraction.</li>
          <li>Extracted text, your question, and recent conversation context are sent for AI processing.</li>
          <li>The saved chat record includes the messages and attachment filename, not the uploaded file bytes.</li>
          <li>Deleting the saved chat does not delete data already sent to an AI provider.</li>
        </ul>
      </section>

      <section>
        <h2>Who processes the AI request</h2>
        <p>
          The current local server configuration uses OpenRouter as a gateway. Its model and fallback settings
          can route requests to different model providers; production settings may differ. The app does not
          currently require a specific provider or enforce zero-data-retention routing.
        </p>
        <p>
          OpenRouter says it does not train on inputs or outputs itself. It also documents that upstream model
          providers have different retention and training policies. The operator has not verified every endpoint
          or the privacy settings of the production OpenRouter account; no blanket no-training or zero-retention
          promise is made here.
        </p>
      </section>

      <section>
        <h2>Saved chats and optional search</h2>
        <p>
          Guest chats are not saved to student chat history. Signed-in chat messages and answers are saved until
          the user deletes the conversation. When web search is enabled, the query is sent to Brave Search and
          retrieved results may be included in the AI request.
        </p>
      </section>

      <section>
        <h2>Before uploading</h2>
        <p>
          Follow your institution's policy and upload only information you are authorized to share. Remove
          patient-identifying details unless you have the required authorization. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> for more detail.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 border-t pt-5">
        <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-2">
          <ShieldCheck className="size-4" /> Privacy Policy
        </Link>
        <Link href="/terms" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-2">
          <FileText className="size-4" /> Terms of Use
        </Link>
        <a
          href="https://openrouter.ai/docs/guides/privacy/data-collection"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-2"
        >
          OpenRouter data collection <ExternalLink className="size-3.5" />
        </a>
      </div>
    </PolicyPage>
  );
}
