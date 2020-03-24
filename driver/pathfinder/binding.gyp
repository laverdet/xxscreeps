{
	'target_defaults': {
		'default_configuration': 'Release',
		'configurations': {
			'Release': {
				'xcode_settings': {
					'GCC_OPTIMIZATION_LEVEL': '3',
				},
			},
			'Profile': {
				'cflags_cc': [ '-O3', '-fprofile-generate' ],
				'ldflags': [ '-fprofile-generate' ],
				'xcode_settings': {
					'GCC_OPTIMIZATION_LEVEL': '3',
					'OTHER_CPLUSPLUSFLAGS': [ '-fprofile-instr-generate=_clangprof.profraw' ],
					'OTHER_LDFLAGS': [ '-fprofile-instr-generate=_clangprof.profraw' ],
				},
			},
			'Optimized': {
				'cflags_cc': [
					'-O3',
					'-fprofile-use=build/Profile/obj.target/native/src/pf.gcda',
					'-fprofile-use=build/Profile/obj.target/native/src/main.gcda',
				],
				'xcode_settings': {
					'OTHER_CPLUSPLUSFLAGS': [ '-fprofile-use=../_clangprof.profdata' ],
				},
			},
		},
	},
	'targets': [
		{
			'target_name': 'native',
			'cflags_cc': [ '-std=c++14', '-g' ],
			'cflags_cc!': [ '-fno-exceptions' ],
			'xcode_settings': {
				'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
				'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
				'CLANG_CXX_LANGUAGE_STANDARD': 'c++14',
			},
			'msvs_settings': {
				'VCCLCompilerTool': {
					'ExceptionHandling': '1',
				},
			},
			'include_dirs': [
				'<!(node -e "require(\'nan\')")',
			],
			'cflags!': [ '-fno-exceptions' ],
			'cflags_cc!': [ '-fno-exceptions' ],
			'conditions': [
				[ 'OS == "win"', { 'defines': ['NOMINMAX'] } ],
				[ 'OS == "win"',
						{ 'defines': [ 'IVM_DLLEXPORT=__declspec(dllexport)' ] },
						{ 'defines': [ 'IVM_DLLEXPORT=' ] },
				],
			],
			'sources': [
				'src/main.cc',
				'src/pf.cc',
			],
		},
	],
}
