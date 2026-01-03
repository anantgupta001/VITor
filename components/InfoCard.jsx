export default function InfoCard({ title, icon: Icon, items = [] }) {
  return (
    <div
      className="
        bg-white dark:bg-gray-800
        rounded-xl
        border border-gray-200 dark:border-gray-700
        p-4
      "
    >
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        )}
        <p className="font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </p>
      </div>

      {items.length > 0 && (
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
