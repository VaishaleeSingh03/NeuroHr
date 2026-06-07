"use client";

import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Brain, Upload, Loader2, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import { mlAPI } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface MLModel {
  id: number;
  model_name: string;
  algorithm: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  status: string;
}

export default function MLTrainingPage() {
  const [models, setModels] = useState<MLModel[]>([]);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("candidate_ranker");
  const [algorithm, setAlgorithm] = useState("random_forest");
  const [tuning, setTuning] = useState("grid_search");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<MLModel | null>(null);

  useEffect(() => {
    mlAPI.models().then((r) => setModels(r.data)).catch(() => {});
  }, []);

  const onDrop = useCallback((files: File[]) => {
    setDatasetFile(files[0]);
    toast.success("Dataset ready for training!");
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
  });

  const train = async () => {
    if (!datasetFile) {
      toast.error("Upload a CSV dataset first");
      return;
    }
    setLoading(true);
    try {
      const { data } = await mlAPI.train(datasetFile, {
        model_name: modelName, algorithm, hyperparameter_tuning: tuning, target_column: "label",
      });
      setLastResult(data);
      setModels((prev) => [data, ...prev]);
      toast.success("Model trained successfully!");
    } catch {
      toast.error("Training failed. Check ML service.");
    } finally {
      setLoading(false);
    }
  };

  const metricsData = lastResult
    ? [
        { metric: "Accuracy", value: lastResult.accuracy * 100 },
        { metric: "Precision", value: lastResult.precision * 100 },
        { metric: "Recall", value: lastResult.recall * 100 },
        { metric: "F1 Score", value: lastResult.f1_score * 100 },
      ]
    : [];

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">ML Training Pipeline</h1>
        <p className="page-subtitle">Train, tune, evaluate, and deploy custom ML models</p>
      </div>

      <div className="responsive-grid-2">
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-aqua" /> Training Configuration
          </h3>

          <div
            {...getRootProps()}
            className="border-2 border-dashed border-aqua/30 rounded-xl p-6 text-center cursor-pointer hover:border-aqua mb-4"
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 text-aqua mx-auto mb-2" />
            <p className="text-sm text-body">
              {datasetFile ? `${datasetFile.name} ready ✓` : "Upload CSV training dataset"}
            </p>
          </div>

          <div className="space-y-3">
            <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Model Name" className="input-field" />
            <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="input-field">
              <option value="random_forest">Random Forest</option>
              <option value="gradient_boosting">Gradient Boosting (XGBoost-style)</option>
              <option value="neural_network">Neural Network</option>
              <option value="logistic_regression">Logistic Regression</option>
            </select>
            <select value={tuning} onChange={(e) => setTuning(e.target.value)} className="input-field">
              <option value="grid_search">Grid Search</option>
              <option value="random_search">Random Search</option>
            </select>
            <button onClick={train} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? "Training..." : "Train Model"}
            </button>
          </div>

          <div className="mt-4 p-3 bg-cream rounded-xl text-xs text-body space-y-1">
            <p>Pipeline: Data Loading → Cleaning → Feature Engineering</p>
            <p>→ Model Training → Hyperparameter Tuning → Evaluation → Save .pkl</p>
          </div>
        </GlassCard>

        <div className="space-y-6">
          {lastResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <GlassCard>
                <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" /> Latest Training Results
                </h3>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "Accuracy", value: `${(lastResult.accuracy * 100).toFixed(1)}%` },
                    { label: "Precision", value: `${(lastResult.precision * 100).toFixed(1)}%` },
                    { label: "Recall", value: `${(lastResult.recall * 100).toFixed(1)}%` },
                    { label: "F1 Score", value: `${(lastResult.f1_score * 100).toFixed(1)}%` },
                  ].map((m) => (
                    <div key={m.label} className="bg-cream rounded-xl p-3 text-center">
                      <p className="text-xs text-muted">{m.label}</p>
                      <p className="text-xl font-bold text-aqua">{m.value}</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={metricsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F6E6C2" />
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#00B8B8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>
            </motion.div>
          )}

          <GlassCard>
            <h3 className="font-bold text-heading mb-4">Trained Models</h3>
            {models.length === 0 ? (
              <p className="text-muted text-sm">No models trained yet</p>
            ) : (
              <div className="space-y-3">
                {models.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white/50 rounded-xl">
                    <div>
                      <p className="font-medium text-heading">{m.model_name}</p>
                      <p className="text-xs text-label capitalize">{m.algorithm.replace("_", " ")}</p>
                    </div>
                    <span className="text-aqua font-bold">{(m.accuracy * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

        </div>
      </div>
    </div>
  );
}
