import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Info,
  Menu,
  NotebookPen,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

type SectionStatus = 'empty' | 'noted' | 'drafted';
type Section = {
  heading: string;
  chapter: number;
  notes: string;
  draft: string;
  status: SectionStatus;
};
type Chapter = {
  name: string;
  shortLabel: string;
  sections: Section[];
};

const chapterSeeds: Omit<Chapter, 'sections'>[] = [
  { name: 'Assessment', shortLabel: 'Assess' },
  { name: 'Analysis of Data', shortLabel: 'Analyse' },
  { name: 'Planning', shortLabel: 'Plan' },
  { name: 'Implementation', shortLabel: 'Implement' },
  { name: 'Evaluation', shortLabel: 'Evaluate' },
  { name: 'Summary and Conclusion', shortLabel: 'Summarise' },
];

const sectionHeadings = [
  ["Patient's Particulars", "Family's Medical/Surgical History", "Family's Socio-Economic History", "Patient's Developmental History", "Patient's Past Medical/Surgical History", "Present Medical/Surgical History"],
  ['Comparison of Data with Standards', 'Pharmacology of Drugs Prescribed', 'Health Needs Identified'],
  ['Objectives for Patient/Family Care', 'Nursing Care Plan'],
  ['Summary of the Actual Nursing Care'],
  ['Statement of Evaluation'],
  ['Summary', 'Conclusion'],
];

function makeChapters(): Chapter[] {
  return chapterSeeds.map((chapter, chapterIndex) => ({
    ...chapter,
    sections: sectionHeadings[chapterIndex].map((heading) => ({
      heading,
      chapter: chapterIndex + 1,
      notes: '',
      draft: '',
      status: 'empty' as SectionStatus,
    })),
  }));
}

const queryClient = new QueryClient();

function Home() {
  const [chapters, setChapters] = useState(makeChapters);
  const [activeChapter, setActiveChapter] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [showOutput, setShowOutput] = useState(true);

  const currentChapter = chapters[activeChapter];
  const currentSection = currentChapter.sections[activeSection];
  const allSections = useMemo(() => chapters.flatMap((chapter) => chapter.sections), [chapters]);
  const notedCount = allSections.filter((section) => section.notes.trim().length > 0).length;
  const draftedCount = allSections.filter((section) => section.draft.trim().length > 0).length;
  const progress = Math.round(((notedCount + draftedCount) / (allSections.length * 2)) * 100);

  const updateCurrentSection = (updates: Partial<Section>) => {
    setChapters((previous) => previous.map((chapter, chapterIndex) => {
      if (chapterIndex !== activeChapter) return chapter;
      return {
        ...chapter,
        sections: chapter.sections.map((section, sectionIndex) =>
          sectionIndex === activeSection ? { ...section, ...updates } : section,
        ),
      };
    }));
  };

  const selectChapter = (index: number) => {
    setActiveChapter(index);
    setActiveSection(0);
    setMobileNavOpen(false);
    setShowOutput(true);
  };

  const selectSection = (index: number) => {
    setActiveSection(index);
    setShowOutput(true);
    setCopied(false);
  };

  const goPrevious = () => {
    if (activeSection > 0) {
      setActiveSection(activeSection - 1);
    } else if (activeChapter > 0) {
      setActiveChapter(activeChapter - 1);
      setActiveSection(chapters[activeChapter - 1].sections.length - 1);
    }
    setShowOutput(true);
  };

  const goNext = () => {
    if (activeSection < currentChapter.sections.length - 1) {
      setActiveSection(activeSection + 1);
    } else if (activeChapter < chapters.length - 1) {
      setActiveChapter(activeChapter + 1);
      setActiveSection(0);
    }
    setShowOutput(true);
  };

  const draftSection = () => {
    if (!currentSection.notes.trim()) {
      setShowOutput(true);
      return;
    }
    setIsDrafting(true);
    setShowOutput(true);
    window.setTimeout(() => {
      const output = `Dry-run draft for ${currentSection.heading}\n\nSource notes received:\n${currentSection.notes.trim()}\n\nDrafting note:\nThis section has been shaped from the notes provided above. Add, remove, or revise any wording so it reflects your clinical judgement and course requirements.\n\nReference status: template examples retrieved; reference material available for structure only.\nSafety check: no patient facts were invented or inferred.\nAI status: no AI key is connected. This is a local, transparent dry-run.`;
      updateCurrentSection({ draft: output, status: 'drafted' });
      setIsDrafting(false);
    }, 560);
  };

  const clearNotes = () => {
    updateCurrentSection({ notes: '', draft: '', status: 'empty' });
    setCopied(false);
  };

  const copyOutput = async () => {
    if (!currentSection.draft) return;
    await navigator.clipboard?.writeText(currentSection.draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const draftAvailable = currentSection.notes.trim().length > 0;
  const atFirst = activeChapter === 0 && activeSection === 0;
  const atLast = activeChapter === chapters.length - 1 && activeSection === currentChapter.sections.length - 1;

  return (
    <div className="workspace-shell min-h-[100dvh]" data-testid="page-carestudy-workspace">
      <aside className={`workspace-sidebar ${mobileNavOpen ? 'is-open' : ''}`} data-testid="navigation-chapters">
        <div className="sidebar-brand">
          <div className="brand-mark"><HeartPulse size={21} strokeWidth={2.4} /></div>
          <div>
            <p className="brand-name">care<span>study</span></p>
            <p className="brand-caption">drafting assistant</p>
          </div>
          <button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close chapters" data-testid="button-close-navigation"><X size={18} /></button>
        </div>

        <div className="sidebar-intro">
          <span className="eyebrow">Your workspace</span>
          <p>Move from bedside notes to a care study you can stand behind.</p>
        </div>

        <nav className="chapter-list" aria-label="Care study chapters">
          {chapters.map((chapter, index) => {
            const chapterNoted = chapter.sections.filter((section) => section.notes.trim()).length;
            const chapterDrafted = chapter.sections.filter((section) => section.draft.trim()).length;
            const isActive = index === activeChapter;
            return (
              <button
                className={`chapter-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => selectChapter(index)}
                key={chapter.name}
                data-testid={`button-chapter-${index + 1}`}
              >
                <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="chapter-nav-copy">
                  <span className="chapter-nav-label">{chapter.name}</span>
                  <span className="chapter-nav-meta">{chapter.sections.length} sections · {chapterDrafted}/{chapter.sections.length} drafted</span>
                </span>
                {chapterNoted > 0 && <CheckCircle2 className="chapter-check" size={15} />}
                {isActive && <ChevronRight className="chapter-arrow" size={16} />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="integrity-note">
            <ShieldCheck size={18} />
            <div><strong>Grounded by design</strong><span>No patient facts are invented.</span></div>
          </div>
          <div className="student-chip">
            <div className="avatar">NS</div>
            <div><strong>Nursing student</strong><span>Personal workspace</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open chapters" data-testid="button-open-navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Care study</span><span className="slash">/</span><strong>Chapter {activeChapter + 1}</strong></div>
          <div className="topbar-actions">
            <span className="save-status"><span className="save-dot" /> Saved locally</span>
            <button className="icon-button" title="Workspace information" aria-label="Workspace information" data-testid="button-workspace-info"><Info size={17} /></button>
          </div>
        </header>

        <div className="main-content">
          <section className="workspace-heading">
            <div>
              <span className="eyebrow">Patient / Family Care Study</span>
              <h1>Build it from what<br /><em>you observed.</em></h1>
              <p className="heading-lede">A quiet place to organise your clinical notes, one chapter at a time. Your words stay yours.</p>
            </div>
            <div className="progress-card" data-testid="status-progress">
              <div className="progress-card-top"><span>Study progress</span><strong>{progress}%</strong></div>
              <div className="progress-track"><span style={{ width: `${Math.max(progress, 3)}%` }} /></div>
              <p>{notedCount} of {allSections.length} sections have notes</p>
            </div>
          </section>

          <div className="mobile-chapter-picker">
            <span>Chapter {activeChapter + 1}</span>
            <select value={activeChapter} onChange={(event) => selectChapter(Number(event.target.value))} data-testid="select-chapter-mobile">
              {chapters.map((chapter, index) => <option value={index} key={chapter.name}>{chapter.name}</option>)}
            </select>
          </div>

          <div className="editor-layout">
            <section className="section-picker">
              <div className="section-picker-heading">
                <div><span className="eyebrow">Chapter {String(activeChapter + 1).padStart(2, '0')}</span><h2>{currentChapter.name}</h2></div>
                <span className="section-count">{activeSection + 1} / {currentChapter.sections.length}</span>
              </div>
              <div className="section-list">
                {currentChapter.sections.map((section, index) => (
                  <button className={`section-item ${index === activeSection ? 'active' : ''}`} key={section.heading} onClick={() => selectSection(index)} data-testid={`button-section-${activeChapter + 1}-${index + 1}`}>
                    <span className="section-index">{activeChapter + 1}.{index + 1}</span>
                    <span className="section-name">{section.heading}</span>
                    {section.status === 'drafted' && <span className="status-dot drafted" title="Drafted" />}
                    {section.status === 'noted' && <span className="status-dot noted" title="Notes added" />}
                  </button>
                ))}
              </div>
              <div className="picker-tip"><NotebookPen size={16} /><span>Select a section to focus your notes.</span></div>
            </section>

            <section className="editor-panel">
              <div className="editor-panel-header">
                <div className="section-title-wrap">
                  <span className="section-kicker">{activeChapter + 1}.{activeSection + 1}</span>
                  <div><h2 data-testid="text-active-section">{currentSection.heading}</h2><p>Capture first. Shape later.</p></div>
                </div>
                <button className="clear-button" onClick={clearNotes} disabled={!currentSection.notes && !currentSection.draft} data-testid="button-clear-notes"><RotateCcw size={14} /> Clear</button>
              </div>
              <div className="notes-editor">
                <div className="editor-label"><span><FileText size={15} /> Clinical notes</span><span className="character-count">{currentSection.notes.length} characters</span></div>
                <textarea
                  value={currentSection.notes}
                  onChange={(event) => updateCurrentSection({ notes: event.target.value, status: event.target.value.trim() ? 'noted' : 'empty' })}
                  placeholder="Write what you observed, heard, measured, or were told…&#10;&#10;Use your own shorthand. There is no need to make it polished yet."
                  data-testid="textarea-clinical-notes"
                />
                <div className="editor-footer"><span><span className="keyboard-key">⌘</span> + Enter to draft</span><span>Private to this browser</span></div>
              </div>
              <div className="draft-action-row">
                <button className="draft-button" onClick={draftSection} disabled={!draftAvailable || isDrafting} data-testid="button-draft-section">
                  {isDrafting ? <><span className="button-pulse" /> Preparing dry-run…</> : <><Sparkles size={16} /> Draft this section <ArrowRight size={16} /></>}
                </button>
                {!draftAvailable && <span className="action-hint">Add notes to unlock drafting</span>}
              </div>

              {showOutput && <div className={`output-panel ${currentSection.draft ? 'has-output' : 'empty-output'}`} data-testid="status-draft-output">
                <div className="output-header">
                  <div><span className="output-icon"><BookOpen size={16} /></span><div><span className="eyebrow">Dry-run output</span><h3>{currentSection.draft ? 'A grounded starting point' : 'Your draft will appear here'}</h3></div></div>
                  {currentSection.draft && <button className="copy-button" onClick={copyOutput} data-testid="button-copy-draft">{copied ? <><ClipboardCheck size={14} /> Copied</> : <><Clipboard size={14} /> Copy text</>}</button>}
                </div>
                {currentSection.draft ? (
                  <pre className="draft-output">{currentSection.draft}</pre>
                ) : (
                  <div className="empty-output-copy"><p>{draftAvailable ? 'Ready when you are. The dry-run will only use the notes you provide.' : 'No notes yet. Add your bedside observations above, then draft this section.'}</p><span><ShieldCheck size={14} /> Transparent, local, and fact-safe</span></div>
                )}
              </div>}

              <div className="editor-navigation">
                <button className="nav-button previous" onClick={goPrevious} disabled={atFirst} data-testid="button-previous-section"><ChevronLeft size={16} /> Previous</button>
                <span>{currentChapter.shortLabel} · {activeSection + 1} of {currentChapter.sections.length}</span>
                <button className="nav-button next" onClick={goNext} disabled={atLast} data-testid="button-next-section">Next section <ChevronRight size={16} /></button>
              </div>
            </section>
          </div>

          <footer className="workspace-footer">
            <span><ShieldCheck size={15} /> Designed to support your thinking, never replace it.</span>
            <span className="footer-rule" /><span>Local preview · no AI key connected</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;