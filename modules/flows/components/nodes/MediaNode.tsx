'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Image as ImageIcon, FileText, Video, Mic, MapPin } from 'lucide-react';
import type { MediaNodeData } from '../../types';

const ICONS = {
  image:    <ImageIcon className="h-3.5 w-3.5 text-white" />,
  video:    <Video className="h-3.5 w-3.5 text-white" />,
  document: <FileText className="h-3.5 w-3.5 text-white" />,
  audio:    <Mic className="h-3.5 w-3.5 text-white" />,
  location: <MapPin className="h-3.5 w-3.5 text-white" />,
} as const;

const TITLES = {
  image: 'Image', video: 'Video', document: 'File', audio: 'Audio', location: 'Location',
} as const;

export function MediaNode({ data, selected }: NodeProps<MediaNodeData>) {
  const kind = data.kind ?? 'image';
  const detail = kind === 'location'
    ? (data.locationName || data.address || (data.latitude != null ? `${data.latitude}, ${data.longitude}` : 'No place set'))
    : (data.caption || data.filename || data.url || 'Nothing attached');

  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-cyan-500' : 'border-cyan-300'}`}>
      <div className="bg-cyan-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        {ICONS[kind]}
        <span className="text-xs font-semibold text-white">{TITLES[kind]}</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2 break-all">{detail}</p>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}
