"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { FileText, Upload, Shield, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import RichTextContent from "@/components/ui/RichTextContent";
import ScoreIndicator from "@/components/ui/ScoreIndicator";
import { documentsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AnalysisResult {
  extracted_text: string;
  extracted_fields: Record<string, unknown>;
  verification_score: number;
  ocr_confidence: number;
  analysis: Record<string, unknown>;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const [docType, setDocType] = useState("resume");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<object[]>([]);
  const [candidateId, setCandidateId] = useState<number | undefined>();

  useEffect(() => {
    documentsAPI.list().then((r) => setHistory(r.data)).catch(() => {});
  }, [user]);

  const onDrop = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      const { data } = await documentsAPI.analyze(files[0], docType, candidateId);
      setResult(data);
      documentsAPI.list().then((r) => setHistory(r.data)).catch(() => {});
      toast.success("Document analyzed!");
    } catch {
      toast.error("Analysis failed. Check services.");
    } finally {
      setLoading(false);
    }
  }, [docType, candidateId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
    multiple: false,
  });

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">Document Intelligence</h1>
        <p className="page-subtitle">NLP + OCR + Computer Vision for document verification</p>
      </div>

      <div className="split-layout">
        <GlassCard>
          <h3 className="font-bold text-heading mb-4">Upload Document</h3>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input-field mb-4">
            <option value="resume">Resume</option>
            <option value="certificate">Certificate</option>
            <option value="id">ID Document</option>
          </select>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragActive ? "border-aqua bg-aqua/5" : "border-aqua/30 hover:border-aqua"}`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <Loader2 className="w-10 h-10 text-aqua mx-auto animate-spin" />
            ) : (
              <Upload className="w-10 h-10 text-aqua mx-auto mb-3" />
            )}
            <p className="text-sm text-body">Upload PDF or image for OCR analysis</p>
          </div>

          <div className="mt-4 space-y-1 text-xs text-muted">
            <p>• Tesseract OCR text extraction</p>
            <p>• Named entity recognition</p>
            <p>• Field verification scoring</p>
          </div>
        </GlassCard>

        <div className="split-layout-main space-y-6">
          {history.length > 0 && (
            <GlassCard>
              <h3 className="font-bold text-heading mb-3">Document History</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(history as Record<string, unknown>[]).map((d) => (
                  <div key={String(d.id)} className="flex justify-between p-2 bg-white/50 rounded-lg text-sm">
                    <span className="capitalize">{String(d.document_type)} — {Math.round(d.verification_score as number)}% verified</span>
                    <span className="text-label text-xs">{new Date(String(d.created_at)).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
          {result ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
                <GlassCard className="text-center">
                  <ScoreIndicator score={result.verification_score} label="Verification Score" size="md" />
                </GlassCard>
                <GlassCard className="text-center" delay={0.1}>
                  <ScoreIndicator score={result.ocr_confidence} label="OCR Confidence" size="md" />
                </GlassCard>
              </div>

              <GlassCard delay={0.2}>
                <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-aqua" /> Extracted Fields
                </h3>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                  {Object.entries(result.extracted_fields).map(([key, value]) => (
                    <div key={key} className="bg-cream rounded-xl p-3">
                      <p className="text-xs text-muted capitalize">{key.replace("_", " ")}</p>
                      <p className="text-sm font-medium text-heading">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard delay={0.3}>
                <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-aqua" /> Extracted Text
                </h3>
                <RichTextContent
                  content={result.extracted_text}
                  variant="on-light"
                  className="bg-white/50 rounded-xl p-4"
                  maxHeight="240px"
                />
              </GlassCard>
            </motion.div>
          ) : (
            <GlassCard className="text-center py-16">
              <FileText className="w-12 h-12 text-aqua/30 mx-auto mb-4" />
              <p className="text-muted">Upload a document to see AI-powered analysis</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
