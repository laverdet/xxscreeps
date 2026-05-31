export module screeps:utility;
import std;
import util;

namespace screeps {

// Convert a contiguous 'enum class' into an iterator
template <class Enum>
struct contiguous_enum_iterator : public util::random_access_iterator_facade<int, unsigned> {
	public:
		using util::random_access_iterator_facade<int, unsigned>::operator+;
		using iterator = contiguous_enum_iterator;
		using size_type = std::underlying_type_t<Enum>;
		using value_type = Enum;
		contiguous_enum_iterator() = default;
		explicit constexpr contiguous_enum_iterator(Enum value) : value_{value} {};

		constexpr auto operator*() const -> value_type { return value_; }
		constexpr auto operator+=(difference_type offset) -> iterator& {
			value_ = static_cast<Enum>(static_cast<size_type>(value_) + offset);
			return *this;
		}
		constexpr auto operator==(const iterator& right) const -> bool { return value_ == right.value_; }
		constexpr auto operator<=>(const iterator& right) const -> std::strong_ordering { return value_ <=> right.value_; }

	private:
		constexpr auto operator+() const -> size_type { return static_cast<size_type>(value_); }
		Enum value_;
};

export template <class Enum>
auto contiguous_enum_range(Enum min, Enum max) {
	return std::ranges::subrange(contiguous_enum_iterator{min}, contiguous_enum_iterator{max} + 1);
}

export using cost_t = int; // maximum: longest chebyshev distance of whole map

// Safely converts an arbitrary position struct into a word
template <int> struct int_for_size;
template <> struct int_for_size<2> {
		using int_t = std::uint16_t;
};
template <> struct int_for_size<4> {
		using int_t = std::uint32_t;
};
template <> struct int_for_size<8> {
		using int_t = std::uint64_t;
};

template <class Type>
constexpr auto flatten(Type location) {
	union union_t {
			constexpr explicit union_t(Type location) : location{location} {}
			Type location;
			typename int_for_size<sizeof(location)>::int_t integer;
	};
	return union_t{location}.integer;
}

template <class Type, class Integral>
constexpr auto unflatten(Integral integer) {
	union union_t {
			constexpr explicit union_t(Integral integer) : integer{integer} {}
			Type location;
			typename int_for_size<sizeof(Type)>::int_t integer;
	};
	return union_t{integer}.location;
}

}; // namespace screeps
