export module screeps:utility;
import std;

namespace screeps {

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
