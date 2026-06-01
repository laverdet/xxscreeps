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

// Returns the given unsigned type for an arbitrary size
template <std::size_t> struct uint_for_size;
template <std::size_t Size>
using uint_for_size_t = uint_for_size<Size>::type;
template <> struct uint_for_size<1> : std::type_identity<std::uint8_t> {};
template <> struct uint_for_size<2> : std::type_identity<std::uint16_t> {};
template <> struct uint_for_size<4> : std::type_identity<std::uint32_t> {};
template <> struct uint_for_size<8> : std::type_identity<std::uint64_t> {};

template <class Type>
constexpr auto flatten(Type location) {
	union union_t {
			constexpr explicit union_t(Type location) : location{location} {}
			Type location;
			uint_for_size_t<sizeof(location)> integer;
	};
	return union_t{location}.integer;
}

template <class Type, class Integral>
constexpr auto unflatten(Integral integer) {
	union union_t {
			constexpr explicit union_t(Integral integer) : integer{integer} {}
			Type location;
			uint_for_size_t<sizeof(Type)> integer;
	};
	return union_t{integer}.location;
}

// Holder for nominal types which cannot be implicitly converted between otherwise compatible
// values.
template <class Type, class>
class nominal {
	public:
		constexpr nominal() = default;
		explicit constexpr nominal(Type value) : value{value} {}

		explicit constexpr operator Type() const { return **this; }
		constexpr auto operator*() const -> Type { return value; }
		constexpr auto operator==(const nominal& right) const -> bool = default;

	private:
		Type value;
};

// Minimal polyfill for std::inplace_vector
template <class Type, std::size_t Size>
class inplace_vector {
	public:
		static_assert(std::is_trivially_destructible_v<Type>);

		[[nodiscard]] constexpr auto empty() const -> bool { return size_ == 0; }
		[[nodiscard]] constexpr auto operator[](this auto& self, std::size_t index) -> auto& { return self.data_[ index ]; }
		[[nodiscard]] constexpr auto size() const -> std::size_t { return size_; }
		constexpr auto back(this auto& self) -> auto& { return self.data_[ self.size_ - 1 ]; }
		constexpr auto begin(this auto& self) { return self.data_.begin(); }
		constexpr auto clear() -> void { size_ = 0; }
		constexpr auto end(this auto& self) { return self.data_.begin() + self.size_; }
		constexpr auto front(this auto& self) -> auto& { return self.data_.front(); }
		constexpr auto pop_back() -> void { --size_; }

		constexpr auto emplace_back(auto&&... args) -> void {
			if (size_ >= Size) {
				throw std::range_error{"capacity exceeded"};
			}
			data_[ size_ ] = Type{std::forward<decltype(args)>(args)...};
			++size_;
		}

	private:
		std::array<Type, Size> data_;
		std::size_t size_ = 0;
};

}; // namespace screeps
