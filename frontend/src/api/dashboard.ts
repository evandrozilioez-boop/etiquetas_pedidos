import { api } from "./client";
import { ResumoDashboard } from "../types";

export async function obterResumoDashboard(): Promise<ResumoDashboard> {
  const { data } = await api.get<ResumoDashboard>("/dashboard");
  return data;
}
