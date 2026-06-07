"use client";

import { motion } from "framer-motion";
import { Mail, Briefcase, Check, X, Phone, Sparkles } from "lucide-react";
import GlassCard from "./GlassCard";
import ScoreIndicator from "./ScoreIndicator";
import RichTextContent from "./RichTextContent";
import { getScoreClass } from "@/lib/utils";

interface CandidateCardProps {
  name: string;
  email: string;
  phone?: string;
  aiScore: number;
  skills: string[];
  missingSkills: string[];
  status: string;
  rank?: number;
  jdFitSummary?: string;
  recommendation?: string;
  onClick?: () => void;
}

export default function CandidateCard({
  name, email, aiScore, skills, missingSkills, status, rank,
  phone, jdFitSummary, recommendation, onClick,
}: CandidateCardProps) {
  return (
    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.2 }}>
      <GlassCard className="cursor-pointer" delay={0}>
        <div onClick={onClick}>
          <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {rank && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-8 h-8 bg-aqua text-inverse rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                >
                  {rank}
                </motion.div>
              )}
              <div className="min-w-0">
                <h3 className="font-bold text-heading text-base sm:text-lg truncate">{name}</h3>
                <p className="text-xs sm:text-sm text-muted flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3 flex-shrink-0" /> {email || "—"}
                </p>
                {phone && (
                  <p className="text-xs text-muted flex items-center gap-1 truncate">
                    <Phone className="w-3 h-3 flex-shrink-0" /> {phone}
                  </p>
                )}
              </div>
            </div>
            <ScoreIndicator score={aiScore} size="sm" />
          </div>

          {recommendation && (
            <p className="text-xs font-semibold text-accent mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {recommendation}
            </p>
          )}

          {jdFitSummary && (
            <div className="text-xs text-body mb-3 bg-cream/60 rounded-lg p-2 border border-aqua/10">
              <RichTextContent content={jdFitSummary} variant="on-light" />
            </div>
          )}

          <div className="mb-3">
            <p className="text-xs font-semibold text-label mb-2 flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> Skills vs JD
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, 6).map((skill) => (
                <span key={skill} className="tag-skill">
                  <Check className="w-3 h-3" /> {skill}
                </span>
              ))}
              {missingSkills.slice(0, 3).map((skill) => (
                <span key={skill} className="tag-missing">
                  <X className="w-3 h-3" /> {skill}
                </span>
              ))}
              {skills.length === 0 && missingSkills.length === 0 && (
                <span className="text-xs text-muted">No skills extracted from resume</span>
              )}
            </div>
          </div>

          <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 pt-3 border-t border-aqua/10">
            <span className={`score-badge ${getScoreClass(aiScore)}`}>
              JD Match: {Math.round(aiScore)}%
            </span>
            <span className={`text-xs capitalize px-2 py-0.5 rounded-full ${status === "employee" ? "bg-green-100 text-green-800 font-semibold" : "text-muted"}`}>
              {status === "employee" ? "Employee" : status}
            </span>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
