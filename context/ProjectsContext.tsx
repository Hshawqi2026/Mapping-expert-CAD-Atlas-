import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { GeoFeature, Project, RasterLayer, RasterService } from '../types';
import {
  loadProjects,
  saveProjects,
  loadActiveProjectId,
  saveActiveProjectId,
} from '../lib/storage';
import { uid } from '../lib/geo';

interface ProjectsContextValue {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  loading: boolean;
  setActiveProjectId: (id: string) => void;
  createProject: (name: string, center: [number, number]) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  addFeature: (feature: GeoFeature) => void;
  addFeatures: (features: GeoFeature[]) => void;
  updateFeature: (id: string, patch: Partial<GeoFeature>) => void;
  updateFeatures: (ids: string[], patch: Partial<GeoFeature>) => void;
  removeFeature: (id: string) => void;
  clearOSMFeatures: () => void;
  updateProjectView: (center: [number, number], zoom: number) => void;
  updateProjectRasterLayers: (layers: RasterLayer[]) => void;
  updateProjectRasterServices: (services: RasterService[]) => void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753]; // Riyadh fallback

function makeDefaultProject(): Project {
  const now = Date.now();
  return {
    id: uid(),
    name: 'مشروع مساحي جديد',
    createdAt: now,
    updatedAt: now,
    features: [],
    center: DEFAULT_CENTER,
    zoom: 15,
  };
}

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let list = await loadProjects();
      if (list.length === 0) {
        list = [makeDefaultProject()];
        await saveProjects(list);
      }
      const activeId = (await loadActiveProjectId()) ?? list[0].id;
      setProjects(list);
      setActiveProjectIdState(list.find((p) => p.id === activeId) ? activeId : list[0].id);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    saveProjects(next);
  }, []);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    saveActiveProjectId(id);
  }, []);

  const createProject = useCallback(
    (name: string, center: [number, number]) => {
      const p: Project = {
        id: uid(),
        name: name.trim() || 'مشروع بدون اسم',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        features: [],
        center,
        zoom: 16,
      };
      const next = [p, ...projects];
      persist(next);
      setActiveProjectId(p.id);
      return p;
    },
    [projects, persist, setActiveProjectId]
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      const next = projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
      persist(next);
    },
    [projects, persist]
  );

  const deleteProject = useCallback(
    (id: string) => {
      let next = projects.filter((p) => p.id !== id);
      if (next.length === 0) next = [makeDefaultProject()];
      persist(next);
      if (activeProjectId === id) setActiveProjectId(next[0].id);
    },
    [projects, persist, activeProjectId, setActiveProjectId]
  );

  const mutateActive = useCallback(
    (fn: (p: Project) => Project) => {
      if (!activeProjectId) return;
      const next = projects.map((p) => (p.id === activeProjectId ? { ...fn(p), updatedAt: Date.now() } : p));
      persist(next);
    },
    [projects, activeProjectId, persist]
  );

  const addFeature = useCallback(
    (feature: GeoFeature) => {
      mutateActive((p) => ({ ...p, features: [...p.features, feature] }));
    },
    [mutateActive]
  );

  const addFeatures = useCallback(
    (features: GeoFeature[]) => {
      mutateActive((p) => {
        const existingOsmIds = new Set(p.features.filter((f) => f.osmId).map((f) => f.osmId));
        const fresh = features.filter((f) => !f.osmId || !existingOsmIds.has(f.osmId));
        return { ...p, features: [...p.features, ...fresh] };
      });
    },
    [mutateActive]
  );

  const updateFeature = useCallback(
    (id: string, patch: Partial<GeoFeature>) => {
      mutateActive((p) => ({
        ...p,
        features: p.features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }));
    },
    [mutateActive]
  );

  const updateFeatures = useCallback(
    (ids: string[], patch: Partial<GeoFeature>) => {
      const selected = new Set(ids);
      mutateActive((p) => ({ ...p, features: p.features.map((f) => selected.has(f.id) ? { ...f, ...patch } : f) }));
    },
    [mutateActive]
  );

  const removeFeature = useCallback(
    (id: string) => {
      mutateActive((p) => ({ ...p, features: p.features.filter((f) => f.id !== id) }));
    },
    [mutateActive]
  );

  const clearOSMFeatures = useCallback(() => {
    mutateActive((p) => ({ ...p, features: p.features.filter((f) => f.source !== 'osm') }));
  }, [mutateActive]);

  const updateProjectView = useCallback(
    (center: [number, number], zoom: number) => {
      mutateActive((p) => ({ ...p, center, zoom }));
    },
    [mutateActive]
  );

  const updateProjectRasterLayers = useCallback(
    (layers: RasterLayer[]) => mutateActive((p) => ({ ...p, rasterLayers: layers })),
    [mutateActive]
  );

  const updateProjectRasterServices = useCallback(
    (services: RasterService[]) => mutateActive((p) => ({ ...p, rasterServices: services })),
    [mutateActive]
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const value: ProjectsContextValue = {
    projects,
    activeProject,
    activeProjectId,
    loading,
    setActiveProjectId,
    createProject,
    renameProject,
    deleteProject,
    addFeature,
    addFeatures,
    updateFeature,
    updateFeatures,
    removeFeature,
    clearOSMFeatures,
    updateProjectView,
    updateProjectRasterLayers,
    updateProjectRasterServices,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
};

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
