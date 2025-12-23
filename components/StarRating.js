export default function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map((n) => (
        <span
          key={n}
          className={`text-2xl cursor-pointer ${
            n <= value ? "text-yellow-400" : "text-gray-300"
          }`}
          onClick={() => onChange(n)}
        >
          ★
        </span>
      ))}
    </div>
  );
}