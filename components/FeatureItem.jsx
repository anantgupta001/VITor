export default function FeatureItem({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400" />
      <p className="text-sm text-gray-600 dark:text-gray-300">{text}</p>
    </div>
  );
}
