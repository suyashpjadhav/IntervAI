import React, { useState, useEffect } from 'react'
import '../style/interview.scss'
import { useInterview } from '../hooks/useInterview.js'
import { useNavigate, useParams, Link } from 'react-router'
import { useAuth } from '../../auth/hooks/useAuth.js'
import PdfViewer from '../components/PdfViewer.jsx'
import MockInterviewPanel from '../components/MockInterviewPanel.jsx'



const NAV_ITEMS = [
    { id: 'strategy', label: 'Interview Strategy', icon: (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>) },
    { id: 'roadmap', label: 'Road Map', icon: (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>) },
    { id: 'comparison', label: 'Resume Compare', icon: (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="12" y1="3" x2="12" y2="17"/><line x1="2" y1="21" x2="22" y2="21"/></svg>) },
    { id: 'mock', label: 'Mock Interview', icon: (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>) }
]

// ── Sub-components ────────────────────────────────────────────────────────────
const RefinedResumeIframe = ({ html }) => {
    const containerRef = React.useRef(null)
    const [ scale, setScale ] = React.useState(1)

    React.useEffect(() => {
        if (!containerRef.current) return
        const updateScale = () => {
            const width = containerRef.current.clientWidth
            setScale(width / 800)
        }
        updateScale()
        window.addEventListener('resize', updateScale)
        
        const observer = new ResizeObserver(updateScale)
        observer.observe(containerRef.current)

        return () => {
            window.removeEventListener('resize', updateScale)
            observer.disconnect()
        }
    }, [])

    const displayScale = scale > 0 ? scale : 1

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#fff' }}>
            <iframe 
                title="Refined Resume Preview"
                srcDoc={html}
                style={{ 
                    width: '800px', 
                    height: `${100 / displayScale}%`, 
                    minHeight: `${100 / displayScale}%`,
                    border: 'none', 
                    background: '#fff',
                    transform: `scale(${displayScale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0
                }}
            />
        </div>
    )
}

const QuestionCard = ({ item, index }) => {
    const [ open, setOpen ] = useState(false)
    return (
        <div className='q-card'>
            <div className='q-card__header' onClick={() => setOpen(o => !o)}>
                <span className='q-card__index'>Q{index + 1}</span>
                <p className='q-card__question'>{item.question}</p>
                <span className={`q-card__chevron ${open ? 'q-card__chevron--open' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
            </div>
            {open && (
                <div className='q-card__body'>
                    <div className='q-card__section'>
                        <span className='q-card__tag q-card__tag--intention'>Intention</span>
                        <p>{item.intention}</p>
                    </div>
                    <div className='q-card__section'>
                        <span className='q-card__tag q-card__tag--answer'>Model Answer</span>
                        <p>{item.answer}</p>
                    </div>
                </div>
            )}
        </div>
    )
}

const RoadMapDay = ({ day, onToggleTask }) => (
    <div className='roadmap-day'>
        <div className='roadmap-day__header'>
            <span className='roadmap-day__badge'>Day {day.day}</span>
            <h3 className='roadmap-day__focus'>{day.focus}</h3>
        </div>
        <ul className='roadmap-day__tasks'>
            {day.tasks.map((task, i) => {
                const isCompleted = typeof task === 'string' ? false : !!task.completed;
                const description = typeof task === 'string' ? task : task.description;
                return (
                    <li key={i} className={`roadmap-day__task-item ${isCompleted ? 'roadmap-day__task-item--completed' : ''}`}>
                        <label className='roadmap-day__task-label'>
                            <input
                                type='checkbox'
                                className='roadmap-day__task-checkbox'
                                checked={isCompleted}
                                onChange={() => onToggleTask(day.day, i, !isCompleted)}
                            />
                            <span className='roadmap-day__task-text'>{description}</span>
                        </label>
                    </li>
                );
            })}
        </ul>
    </div>
)

// ── Main Component ────────────────────────────────────────────────────────────
const Interview = () => {
    const [ activeNav, setActiveNav ] = useState('strategy')
    const [ activePill, setActivePill ] = useState('projects')
    const [ selectedQuestionIndex, setSelectedQuestionIndex ] = useState(0)
    const [ isSideBySide, setIsSideBySide ] = useState(true)
    const { user, handleLogout } = useAuth()
    const { 
        report, 
        getReportById, 
        loading, 
        pdfLoading, 
        templateLoading, 
        getResumePdf, 
        changeTemplate, 
        safeFileUrl, 
        fileType,
        mockSession,
        setMockSession,
        mockSessions,
        mockLoading,
        startMockInterview,
        submitCandidateAnswer,
        endMockInterview,
        fetchMockSessions,
        updatePreparationTask
    } = useInterview()
    const { interviewId } = useParams()

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        }
    }, [ interviewId ])



    if (loading || !report) {
        return (
            <main className='loading-screen'>
                <div className='loading-screen__spinner' />
                <h2 className='loading-screen__title'>Loading your interview plan...</h2>
                <p className='loading-screen__sub'>Fetching your personalised report, just a moment.</p>
            </main>
        )
    }

    const originalScore = report.matchScoreOriginal !== undefined ? report.matchScoreOriginal : report.matchScore;
    const refinedScore = report.matchScoreRefined !== undefined ? report.matchScoreRefined : report.matchScore;

    const originalScoreColor = originalScore >= 80 ? 'score--high' : originalScore >= 60 ? 'score--mid' : 'score--low';
    const refinedScoreColor = refinedScore >= 80 ? 'score--high' : refinedScore >= 60 ? 'score--mid' : 'score--low';

    // SVG ring math
    const RADIUS = 30
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS
    const originalDashOffset = CIRCUMFERENCE - (originalScore / 100) * CIRCUMFERENCE
    const refinedDashOffset = CIRCUMFERENCE - (refinedScore / 100) * CIRCUMFERENCE


    return (
        <div className='interview-page'>
            <div className={`interview-container ${(activeNav === 'comparison' && isSideBySide) || activeNav === 'mock' ? 'interview-container--wide' : ''}`}>
                <nav className="top-nav">
                    <div className="user-info">
                        <Link to="/" className="back-link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </Link>
                    </div>
                    <button onClick={handleLogout} className="logout-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Logout
                    </button>
                </nav>

                <div className={`interview-layout ${(activeNav === 'comparison' && isSideBySide) || activeNav === 'mock' ? 'interview-layout--wide' : ''}`}>

                {/* ── Left Nav ── */}
                <nav className='interview-nav'>
                    <div className="nav-content">
                        <p className='interview-nav__label'>Sections</p>
                        {NAV_ITEMS.map(item => (
                            <button
                                key={item.id}
                                className={`interview-nav__item ${activeNav === item.id ? 'interview-nav__item--active' : ''}`}
                                onClick={() => setActiveNav(item.id)}
                            >
                                <span className='interview-nav__icon'>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => { getResumePdf(interviewId) }}
                        disabled={pdfLoading}
                        className={`button primary-button ${pdfLoading ? 'primary-button--loading' : ''}`}>
                        {pdfLoading ? (
                            <span className="btn-spinner" />
                        ) : (
                            <svg height={"0.8rem"} style={{ marginRight: "0.8rem" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 16L7 11H10V3H14V11H17L12 16ZM5 18H19V20H5V18Z"></path></svg>
                        )}
                        {pdfLoading ? 'Generating PDF...' : 'Download Resume'}
                    </button>
                </nav>

                <div className='interview-divider' />

                {/* ── Center Content ── */}
                <main className='interview-content'>
                    {activeNav === 'strategy' && (() => {
                        const hasStrategy = !!(report.projectQuestions && report.projectQuestions.length > 0);
                        
                        const projectQuestions = report.projectQuestions || [];
                        const workExperienceQuestions = report.workExperienceQuestions || [];
                        const behavioralQuestions = report.behavioralQuestions || [];
                        
                        let currentQuestions = [];
                        if (hasStrategy) {
                            if (activePill === 'projects') currentQuestions = projectQuestions;
                            else if (activePill === 'work') currentQuestions = workExperienceQuestions;
                            else currentQuestions = behavioralQuestions;
                        } else {
                            const legacyTechnical = report.technicalQuestions || [];
                            const legacyBehavioral = report.behavioralQuestions || [];
                            if (activePill === 'technical' || activePill === 'projects') {
                                currentQuestions = legacyTechnical.map((q, idx) => ({
                                    id: `legacy-tech-${idx}`,
                                    question: q.question,
                                    referencedBullet: "N/A (Legacy)",
                                    interviewerMotive: q.intention || "N/A",
                                    strategicAnswer: {
                                        openingHook: q.answer || "N/A",
                                        coreDefense: "N/A",
                                        preemptiveTradeoff: "N/A",
                                        keywordsToNail: []
                                    }
                                }));
                            } else {
                                currentQuestions = legacyBehavioral.map((q, idx) => ({
                                    id: `legacy-beh-${idx}`,
                                    question: q.question,
                                    referencedBullet: "N/A (Legacy)",
                                    interviewerMotive: q.intention || "N/A",
                                    strategicAnswer: {
                                        openingHook: q.answer || "N/A",
                                        coreDefense: "N/A",
                                        preemptiveTradeoff: "N/A",
                                        keywordsToNail: []
                                    }
                                }));
                            }
                        }

                        const displayIndex = currentQuestions[selectedQuestionIndex] ? selectedQuestionIndex : 0;
                        const activeQ = currentQuestions[displayIndex];

                        return (
                            <section style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div className='content-header'>
                                    <h2>Interview Strategy</h2>
                                    <span className='content-header__count'>3-Pillar Defense</span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                                    {hasStrategy ? (
                                        <>
                                            <button 
                                                onClick={() => { setActivePill('projects'); setSelectedQuestionIndex(0); }}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '2rem',
                                                    border: '1px solid ' + (activePill === 'projects' ? '#ff2d78' : '#2a3348'),
                                                    background: activePill === 'projects' ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                    color: activePill === 'projects' ? '#fff' : '#7d8590',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                📁 Projects ({projectQuestions.length})
                                            </button>
                                            <button 
                                                onClick={() => { setActivePill('work'); setSelectedQuestionIndex(0); }}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '2rem',
                                                    border: '1px solid ' + (activePill === 'work' ? '#ff2d78' : '#2a3348'),
                                                    background: activePill === 'work' ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                    color: activePill === 'work' ? '#fff' : '#7d8590',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                💼 Work Experience ({workExperienceQuestions.length})
                                            </button>
                                            <button 
                                                onClick={() => { setActivePill('behavioral'); setSelectedQuestionIndex(0); }}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '2rem',
                                                    border: '1px solid ' + (activePill === 'behavioral' ? '#ff2d78' : '#2a3348'),
                                                    background: activePill === 'behavioral' ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                    color: activePill === 'behavioral' ? '#fff' : '#7d8590',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                🤝 Behavioral ({behavioralQuestions.length})
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => { setActivePill('projects'); setSelectedQuestionIndex(0); }}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '2rem',
                                                    border: '1px solid ' + ((activePill === 'projects' || activePill === 'technical') ? '#ff2d78' : '#2a3348'),
                                                    background: (activePill === 'projects' || activePill === 'technical') ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                    color: (activePill === 'projects' || activePill === 'technical') ? '#fff' : '#7d8590',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                📁 Technical ({report.technicalQuestions?.length || 0})
                                            </button>
                                            <button 
                                                onClick={() => { setActivePill('behavioral'); setSelectedQuestionIndex(0); }}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    borderRadius: '2rem',
                                                    border: '1px solid ' + (activePill === 'behavioral' ? '#ff2d78' : '#2a3348'),
                                                    background: activePill === 'behavioral' ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                    color: activePill === 'behavioral' ? '#fff' : '#7d8590',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                🤝 Behavioral ({report.behavioralQuestions?.length || 0})
                                            </button>
                                        </>
                                    )}
                                </div>

                                {currentQuestions.length > 0 ? (
                                    <div style={{ display: 'flex', gap: '1.25rem', width: '100%', flex: 1, minHeight: '480px' }}>
                                        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '580px', overflowY: 'auto' }}>
                                            {currentQuestions.map((q, idx) => (
                                                <div 
                                                    key={q.id || idx}
                                                    onClick={() => setSelectedQuestionIndex(idx)}
                                                    style={{
                                                        padding: '0.75rem 0.9rem',
                                                        background: displayIndex === idx ? 'rgba(255, 45, 120, 0.08)' : '#1c2230',
                                                        border: '1px solid ' + (displayIndex === idx ? '#ff2d78' : '#2a3348'),
                                                        borderRadius: '0.35rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.7rem', color: '#ff2d78', fontWeight: 'bold', marginBottom: '0.15rem' }}>Q{idx + 1}</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: '500', color: '#e6edf3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.35' }}>
                                                        {q.question}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ flex: '1.8', background: '#1c2230', border: '1px solid #2a3348', borderRadius: '0.4rem', padding: '1.25rem', height: 'fit-content', overflowY: 'auto', maxHeight: '580px' }}>
                                            {activeQ ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.7rem', color: '#ff2d78', fontWeight: 'bold', marginBottom: '0.2rem' }}>QUESTION {displayIndex + 1}</div>
                                                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: '#e6edf3', lineHeight: '1.4' }}>{activeQ.question}</h3>
                                                    </div>

                                                    {activeQ.referencedBullet && activeQ.referencedBullet !== "N/A (Legacy)" && (
                                                        <div style={{ backgroundColor: '#1e2535', borderLeft: '2px solid #ff2d78', fontSize: '0.75rem', fontStyle: 'italic', padding: '0.6rem 0.8rem', margin: '0.5rem 0', color: '#e6edf3', borderRadius: '0 0.25rem 0.25rem 0' }}>
                                                            <div style={{ fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', color: '#7d8590', marginBottom: '0.15rem' }}>Referenced Resume Bullet</div>
                                                            <div>"{activeQ.referencedBullet}"</div>
                                                        </div>
                                                    )}

                                                    <div>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Interviewer Motive</div>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#e6edf3', lineHeight: '1.4' }}>{activeQ.interviewerMotive}</p>
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', background: '#161b22', padding: '0.9rem', borderRadius: '0.3rem', border: '1px solid #2a3348' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#ff2d78', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>Strategic Answer</div>
                                                        
                                                        {hasStrategy ? (
                                                            <>
                                                                <div>
                                                                    <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', marginBottom: '0.1rem' }}>1. Opening Hook</div>
                                                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#e6edf3', lineHeight: '1.35' }}>{activeQ.strategicAnswer?.openingHook}</p>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', marginBottom: '0.1rem' }}>2. Core Defense</div>
                                                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#e6edf3', lineHeight: '1.35' }}>{activeQ.strategicAnswer?.coreDefense}</p>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', marginBottom: '0.1rem' }}>3. Preemptive Trade-off</div>
                                                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#e6edf3', lineHeight: '1.35' }}>{activeQ.strategicAnswer?.preemptiveTradeoff}</p>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div>
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', marginBottom: '0.1rem' }}>Suggested Answer</div>
                                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#e6edf3', lineHeight: '1.35' }}>{activeQ.strategicAnswer?.openingHook}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {activeQ.strategicAnswer?.keywordsToNail && activeQ.strategicAnswer.keywordsToNail.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#7d8590', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>Keywords to Nail</div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                                {activeQ.strategicAnswer.keywordsToNail.map((keyword, kIdx) => (
                                                                    <span 
                                                                        key={kIdx} 
                                                                        style={{
                                                                            fontSize: '0.68rem',
                                                                            fontWeight: '600',
                                                                            color: '#ff2d78',
                                                                            background: 'rgba(255, 45, 120, 0.1)',
                                                                            border: '1px solid rgba(255, 45, 120, 0.2)',
                                                                            padding: '0.15rem 0.4rem',
                                                                            borderRadius: '0.15rem'
                                                                        }}
                                                                    >
                                                                        {keyword}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ color: '#7d8590', textAlign: 'center', padding: '2rem 0' }}>Select a question to view detailed strategy.</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: '#7d8590', textAlign: 'center', padding: '3rem 0' }}>No questions available for this category.</div>
                                )}
                            </section>
                        );
                    })()}

                    {activeNav === 'roadmap' && (
                        <section>
                            <div className='content-header'>
                                <h2>Preparation Road Map</h2>
                                <span className='content-header__count'>{report.preparationPlan.length}-day plan</span>
                            </div>
                            <div className='roadmap-list'>
                                {report.preparationPlan.map((day) => (
                                    <RoadMapDay 
                                        key={day.day} 
                                        day={day} 
                                        onToggleTask={(dayNum, taskIndex, isChecked) => 
                                            updatePreparationTask({ day: dayNum, taskIndex, completed: isChecked })
                                        } 
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {activeNav === 'mock' && (
                        <MockInterviewPanel 
                            reportId={interviewId}
                            jobDescription={report.jobDescription}
                            resume={report.resume}
                            mockSession={mockSession}
                            setMockSession={setMockSession}
                            mockSessions={mockSessions}
                            mockLoading={mockLoading}
                            startMockInterview={startMockInterview}
                            submitCandidateAnswer={submitCandidateAnswer}
                            endMockInterview={endMockInterview}
                            fetchMockSessions={fetchMockSessions}
                        />
                    )}

                    {activeNav === 'comparison' && (() => {
                        const isOptimal = report.metadata?.isOriginalResumeOptimal;
                        const lift = refinedScore - originalScore;
                        const liftStr = isOptimal ? 'Optimal' : (lift > 0 ? `+${lift}%` : `${lift}%`);
                        const criticalGaps = report.skillGaps
                            ? report.skillGaps.filter(gap => gap.severity === 'high' || gap.severity === 'medium').map(gap => gap.skill)
                            : [];
                        const criticalGapsStr = criticalGaps.length > 0 ? criticalGaps.join(', ') : 'None';
                        return (
                            <section style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div className='content-header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <h2>Resume Comparison</h2>
                                        <button 
                                            onClick={() => setIsSideBySide(!isSideBySide)}
                                            style={{
                                                padding: '0.3rem 0.65rem',
                                                fontSize: '0.75rem',
                                                borderRadius: '0.25rem',
                                                border: '1px solid ' + (isSideBySide ? '#ff2d78' : '#2a3348'),
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                color: isSideBySide ? '#fff' : '#7d8590',
                                                background: isSideBySide ? 'rgba(255, 45, 120, 0.15)' : '#1e2535',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            Side-by-Side
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.4rem', background: '#1e2535', padding: '0.25rem', borderRadius: '0.35rem', border: '1px solid #2a3348' }}>
                                        <button 
                                            disabled={templateLoading}
                                            onClick={() => changeTemplate(interviewId, 'early')}
                                            style={{ 
                                                padding: '0.3rem 0.65rem', 
                                                fontSize: '0.75rem', 
                                                borderRadius: '0.25rem', 
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                color: report.selectedTemplate === 'early' ? '#fff' : '#7d8590',
                                                background: report.selectedTemplate === 'early' ? '#ff2d78' : 'transparent',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            Early Career
                                        </button>
                                        <button 
                                            disabled={templateLoading}
                                            onClick={() => changeTemplate(interviewId, 'exptrack')}
                                            style={{ 
                                                padding: '0.3rem 0.65rem', 
                                                fontSize: '0.75rem', 
                                                borderRadius: '0.25rem', 
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                color: report.selectedTemplate === 'exptrack' ? '#fff' : '#7d8590',
                                                background: report.selectedTemplate === 'exptrack' ? '#ff2d78' : 'transparent',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            Experienced Track
                                        </button>
                                    </div>
                                </div>

                                {report.metadata?.isOriginalResumeOptimal && (
                                    <div style={{
                                        background: 'rgba(56, 139, 253, 0.1)',
                                        border: '1px solid rgba(56, 139, 253, 0.2)',
                                        color: '#58a6ff',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '0.4rem',
                                        marginBottom: '1rem',
                                        fontSize: '0.82rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <span>ℹ️</span>
                                        <span><strong>Optimal Resume:</strong> Your uploaded resume is already optimal and has the highest ATS score. The refined resume below preserves your original achievements in the chosen layout, and your interview plan has been generated directly from your uploaded resume content.</span>
                                    </div>
                                )}

                                {isSideBySide && (
                                    <div className="top-summary-bar" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: '#1c2230',
                                        border: '1px solid #2a3348',
                                        borderRadius: '0.4rem',
                                        padding: '0.75rem 1.25rem',
                                        marginBottom: '1rem',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 5,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                            <span style={{ fontSize: '0.85rem', color: '#7d8590', fontWeight: '500' }}>
                                                ATS Score Lift: <strong style={{ color: '#3fb950', fontSize: '0.95rem' }}>{liftStr}</strong>
                                            </span>
                                            <div style={{ width: '1px', height: '16px', background: '#2a3348' }} />
                                            <span style={{ fontSize: '0.85rem', color: '#7d8590', fontWeight: '500' }}>
                                                Missing Criticals: <strong style={{ color: '#ff4d4d', fontSize: '0.95rem' }}>{criticalGapsStr}</strong>
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem', color: '#7d8590' }}>
                                            <span>Original: <strong>{originalScore}%</strong></span>
                                            <span>➔</span>
                                            <span>Refined: <strong>{refinedScore}%</strong></span>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: '520px', marginTop: '0.5rem', position: 'relative' }}>
                                    
                                    {templateLoading && (
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(13, 17, 23, 0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '0.4rem', border: '1px solid #2a3348' }}>
                                            <div className="loading-screen__spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
                                            <span style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#7d8590' }}>Regenerating template...</span>
                                        </div>
                                    )}

                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1c2230', border: '1px solid #2a3348', borderRadius: '0.4rem', overflow: 'hidden' }}>
                                        <div style={{ padding: '0.6rem 1rem', background: '#161b22', borderBottom: '1px solid #2a3348', fontSize: '0.8rem', fontWeight: 'bold', color: '#7d8590', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>ORIGINAL RESUME</span>
                                            <span style={{ fontSize: '0.75rem', color: '#ff4d4d', background: 'rgba(255, 77, 77, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '0.2rem' }}>ATS Match: {originalScore}%</span>
                                        </div>
                                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#0d1117', display: 'flex', justifyContent: 'center' }}>
                                            {fileType === 'application/pdf' && safeFileUrl ? (
                                                <div className="shadow-2xl" style={{ backgroundColor: '#ffffff', width: '100%', height: '100%', minHeight: '750px', overflowY: 'auto', overflowX: 'hidden' }}>
                                                    <PdfViewer url={safeFileUrl} />
                                                </div>
                                            ) : (
                                                <div style={{ width: '100%', aspectRatio: '1/1.414', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', fontFamily: 'Georgia, serif', fontSize: '11px', lineHeight: '1.25', textAlign: 'left', backgroundColor: '#ffffff', color: '#000000', padding: '24px', boxSizing: 'border-box' }}>
                                                    {report.resume ? report.resume.trim() : (report.selfDescription ? `[Profile description provided]:\n\n${report.selfDescription}` : "No original resume or profile description provided.")}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1c2230', border: '1px solid #2a3348', borderRadius: '0.4rem', overflow: 'hidden' }}>
                                        <div style={{ padding: '0.6rem 1rem', background: '#161b22', borderBottom: '1px solid #2a3348', fontSize: '0.8rem', fontWeight: 'bold', color: '#7d8590', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>REFINED BY INTERVAI</span>
                                            <span style={{ fontSize: '0.75rem', color: '#3fb950', background: 'rgba(63, 185, 80, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '0.2rem' }}>ATS Match: {refinedScore}%</span>
                                        </div>
                                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#0d1117', display: 'flex', justifyContent: 'center' }}>
                                            <div className="shadow-2xl" style={{ backgroundColor: '#ffffff', color: '#000000', width: '100%', height: '100%', minHeight: '750px', position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
                                                <RefinedResumeIframe html={report.refinedResumeHtml} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        );
                    })()}
                </main>

                {!((activeNav === 'comparison' && isSideBySide) || activeNav === 'mock') && <div className='interview-divider' />}
                
                {!((activeNav === 'comparison' && isSideBySide) || activeNav === 'mock') && (
                    <aside className='interview-sidebar'>
                        {/* Match Score Comparison */}
                        <div className='match-score-comparison' style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
                            <p className='match-score__label'>ATS Score Lift</p>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                                {/* Original Ring */}
                                <div className='match-score' style={{ flex: 1, gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#7d8590', fontWeight: '500' }}>Original</span>
                                    <div className={`match-score__ring-wrap ${originalScoreColor}`}>
                                        <svg width="72" height="72" viewBox="0 0 72 72">
                                            <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                                            <circle cx="36" cy="36" r={RADIUS} fill="none" className="match-score__arc" strokeWidth="5" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={originalDashOffset} transform="rotate(-90 36 36)" />
                                        </svg>
                                        <div className="match-score__center">
                                            <span className='match-score__value' style={{ fontSize: '1.15rem' }}>{originalScore}</span>
                                            <span className='match-score__pct' style={{ fontSize: '0.65rem' }}>%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Divider arrow */}
                                <div style={{ display: 'flex', alignItems: 'center', color: '#ff2d78', fontWeight: 'bold', fontSize: '1.25rem', paddingBottom: '0.2rem' }}>➔</div>

                                {/* Refined Ring */}
                                <div className='match-score' style={{ flex: 1, gap: '0.4rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#7d8590', fontWeight: '500' }}>Refined</span>
                                    <div className={`match-score__ring-wrap ${refinedScoreColor}`}>
                                        <svg width="72" height="72" viewBox="0 0 72 72">
                                            <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                                            <circle cx="36" cy="36" r={RADIUS} fill="none" className="match-score__arc" strokeWidth="5" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={refinedDashOffset} transform="rotate(-90 36 36)" />
                                        </svg>
                                        <div className="match-score__center">
                                            <span className='match-score__value' style={{ fontSize: '1.15rem' }}>{refinedScore}</span>
                                            <span className='match-score__pct' style={{ fontSize: '0.65rem' }}>%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {report.metadata?.isOriginalResumeOptimal ? (
                                <div style={{ background: 'rgba(63, 185, 80, 0.1)', border: '1px solid rgba(63, 185, 80, 0.2)', padding: '0.35rem 0.5rem', borderRadius: '0.25rem', textAlign: 'center', fontSize: '0.78rem', color: '#3fb950', fontWeight: 'bold' }}>
                                    Your original resume is optimal!
                                </div>
                            ) : refinedScore > originalScore ? (
                                <div style={{ background: 'rgba(63, 185, 80, 0.1)', border: '1px solid rgba(63, 185, 80, 0.2)', padding: '0.35rem 0.5rem', borderRadius: '0.25rem', textAlign: 'center', fontSize: '0.78rem', color: '#3fb950', fontWeight: 'bold' }}>
                                    Lift: +{refinedScore - originalScore}% Match Rate
                                </div>
                            ) : null}
                        </div>

                        <div className='sidebar-divider' />

                        {/* Skill Gaps */}
                        <div className='skill-gaps'>
                            <p className='skill-gaps__label'>Skill Gaps</p>
                            <div className='skill-gaps__list'>
                                {report.skillGaps.map((gap, i) => (
                                    <div key={i} className={`skill-gap-row skill-gap-row--${gap.severity}`}>
                                        <div className='skill-gap-row__header'>
                                            <span className={`skill-gap-row__badge skill-gap-row__badge--${gap.severity}`}>
                                                {gap.severity}
                                            </span>
                                        </div>
                                        <span className='skill-gap-row__name'>{gap.skill}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                )}
                </div>
            </div>
        </div>
    )
}

export default Interview