import { Hammer } from "lucide-react";

interface ModuleStubProps {
  title: string;
  phase: string;
  description: string;
  features: string[];
}

export function ModuleStub({ title, phase, description, features }: ModuleStubProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#E7DDD0] p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3ECE2] text-[#4A2C18] flex items-center justify-center">
            <Hammer className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#4A2C18]">{title}</h1>
            <p className="text-xs text-[#7B6554]">{description}</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
          {phase}
        </span>
      </div>

      <div className="border-t border-[#F3ECE2] pt-4">
        <p className="text-xs font-semibold text-[#4A3828] mb-2">
          Chức năng sẽ triển khai trong phân hệ này:
        </p>
        <ul className="list-disc list-inside text-sm text-[#5C4938] space-y-1.5">
          {features.map((feat) => (
            <li key={feat}>{feat}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
