"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { formatDurationMinutes, interpretNaturalLanguageUpdate, type NaturalLanguageInterpretation } from "@/lib/naturalLanguageUpdate";
import { matchProgrammeActivities, type ProgrammeMatchCandidate } from "@/lib/programmeActivityMatcher";
import type { ProgrammeActivity } from "@/types/site";

const VOICE_UNSUPPORTED_MESSAGE = "Voice input isn't supported in this browser. You can type the update instead.";

// Minimal shape of the browser Web Speech API (not part of TypeScript's DOM lib),
// covering only what this component uses.
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const globalWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition ?? null;
}

const RECORD_TYPE_LABEL: Record<string, string> = {
  work: "Measured Work",
  disruption: "Disruption",
  waiting: "Waiting",
  delay: "Delay",
  variation: "Variation / Additional Work",
  break: "Break",
};

const CONFIDENCE_LABEL: Record<ProgrammeMatchCandidate["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const needsConfirmation = "Needs confirmation";

type Props = {
  programmeActivities: ProgrammeActivity[];
};

function ProgrammeCandidate({
  candidate,
  selectedActivityId,
  onSelect,
}: {
  candidate: ProgrammeMatchCandidate;
  selectedActivityId: string | null;
  onSelect: (activityId: string) => void;
}) {
  const { activity } = candidate;
  const isSelected = selectedActivityId === activity.id;

  return (
    <div className="nl-update-programme-candidate">
      <div className="nl-update-programme-candidate-header">
        <span className="nl-update-programme-candidate-id">{activity.programmeActivityId}</span>
        <span className="nl-update-programme-candidate-name">{activity.activityName ?? activity.activity ?? "Untitled activity"}</span>
        <span className={`nl-update-programme-badge nl-update-programme-badge-${candidate.confidence}`}>
          {CONFIDENCE_LABEL[candidate.confidence]}
        </span>
      </div>

      {candidate.reasons.length > 0 && (
        <>
          <p className="nl-update-programme-candidate-matched">Matched because:</p>
          <ul className="nl-update-programme-reasons">
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        className="secondary-button"
        aria-pressed={isSelected}
        onClick={() => onSelect(activity.id)}
      >
        {isSelected ? "Selected" : "Use this activity"}
      </button>
    </div>
  );
}

export default function NaturalLanguageUpdateEntry({ programmeActivities }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [interpretation, setInterpretation] = useState<NaturalLanguageInterpretation | null>(null);
  const [matches, setMatches] = useState<ProgrammeMatchCandidate[] | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  function clearInterpretationState() {
    setInterpretation(null);
    setMatches(null);
    setSelectedActivityId(null);
  }

  function handleInterpret() {
    const result = interpretNaturalLanguageUpdate(text);
    setInterpretation(result);
    setMatches(matchProgrammeActivities(text, result, programmeActivities));
    setSelectedActivityId(null);
  }

  function handleCancel() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceStatus(null);
    setOpen(false);
    setText("");
    clearInterpretationState();
  }

  function startRecording() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus(VOICE_UNSUPPORTED_MESSAGE);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setText((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
        clearInterpretationState();
        setVoiceStatus(null);
      } else {
        setVoiceStatus("No speech detected. Please try again.");
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setVoiceStatus("Microphone access was denied. Allow microphone access to use voice input.");
      } else if (event.error === "no-speech") {
        setVoiceStatus("No speech detected. Please try again.");
      } else {
        setVoiceStatus("Voice recognition ran into a problem. Please try again or type the update instead.");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setVoiceStatus(null);
    setIsRecording(true);
    recognition.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <div className="nl-update">
      {!open && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => setOpen(true)}
        >
          Tell SitePulse what happened
        </button>
      )}

      {open && (
        <section className="nl-update-panel">
          <h2>Tell SitePulse what happened</h2>
          <p className="nl-update-help">
            Describe what happened naturally. Include the location, activity, gang, times and people affected where known.
          </p>

          <div className="nl-update-voice">
            {!voiceSupported ? (
              <p className="nl-update-voice-status">{VOICE_UNSUPPORTED_MESSAGE}</p>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? "Stop recording" : "🎙 Start recording"}
                </button>
                {isRecording && <p className="nl-update-voice-status nl-update-voice-listening">● Listening...</p>}
                {!isRecording && voiceStatus && <p className="nl-update-voice-status">{voiceStatus}</p>}
              </>
            )}
          </div>

          <label className="attendance-field">
            <span>What happened</span>
            <textarea
              rows={5}
              value={text}
              onChange={(event) => { setText(event.target.value); clearInterpretationState(); }}
              placeholder="Four operatives on Gang 1 stopped work on North Elevation Level 10 at 10:15 because the mast climber was unavailable. Work restarted at 12:30."
            />
          </label>
          <div className="nl-update-actions">
            <button
              type="button"
              className="primary-button"
              style={{ width: "auto", minHeight: 42, marginTop: 0, padding: "9px 18px" }}
              disabled={!text.trim()}
              onClick={handleInterpret}
            >
              Interpret update
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
          {interpretation && (
            <div className="nl-update-preview">
              <strong>Interpretation preview</strong>
              <dl className="nl-update-preview-fields">
                <div><dt>Record type</dt><dd>{interpretation.recordType ? RECORD_TYPE_LABEL[interpretation.recordType] : needsConfirmation}</dd></div>
                <div><dt>Location</dt><dd>{interpretation.locationText ?? needsConfirmation}</dd></div>
                <div><dt>Gang</dt><dd>{interpretation.gangText ?? needsConfirmation}</dd></div>
                <div><dt>Operatives affected</dt><dd>{interpretation.operativeCount ?? needsConfirmation}</dd></div>
                <div><dt>Start</dt><dd>{interpretation.startTime ?? needsConfirmation}</dd></div>
                <div><dt>Finish</dt><dd>{interpretation.finishTime ?? needsConfirmation}</dd></div>
                <div><dt>Duration</dt><dd>{interpretation.durationMinutes !== null ? formatDurationMinutes(interpretation.durationMinutes) : needsConfirmation}</dd></div>
                <div><dt>Reason</dt><dd>{interpretation.reason ?? needsConfirmation}</dd></div>
              </dl>

              <div className="nl-update-programme">
                <strong>Programme activity</strong>

                {!matches || matches.length === 0 ? (
                  <>
                    <p className="nl-update-programme-status">{needsConfirmation}</p>
                    <p className="nl-update-programme-help">SitePulse could not confidently match this update to a programme activity.</p>
                  </>
                ) : matches[0].confidence === "high" ? (
                  <>
                    <p className="nl-update-programme-help">Suggested programme activity</p>
                    <ProgrammeCandidate
                      candidate={matches[0]}
                      selectedActivityId={selectedActivityId}
                      onSelect={setSelectedActivityId}
                    />
                  </>
                ) : (
                  <>
                    <p className="nl-update-programme-help">Possible programme activities</p>
                    <p className="nl-update-programme-help">
                      SitePulse found more than one possible programme activity. Please confirm the correct one.
                    </p>
                    {matches.map((candidate) => (
                      <ProgrammeCandidate
                        key={candidate.activity.id}
                        candidate={candidate}
                        selectedActivityId={selectedActivityId}
                        onSelect={setSelectedActivityId}
                      />
                    ))}
                  </>
                )}

                {selectedActivityId && (() => {
                  const selected = matches?.find((candidate) => candidate.activity.id === selectedActivityId);
                  if (!selected) return null;
                  return (
                    <p className="nl-update-programme-selected">
                      <strong>Selected programme activity:</strong><br />
                      {selected.activity.programmeActivityId} — {selected.activity.activityName ?? selected.activity.activity ?? "Untitled activity"}
                    </p>
                  );
                })()}
              </div>

              <p className="nl-update-preview-original"><strong>Original update:</strong><br />{interpretation.originalText}</p>
              <p className="nl-update-preview-note">Nothing has been saved yet.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

