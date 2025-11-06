#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Error, IntoVal, Symbol,
};

mod keys {
    pub const REGISTRY: &[u8] = b"REG_ADDR";
    pub const TLD: &[u8] = b"REG_TLD";
    pub const PARAMS: &[u8] = b"REG_PARM";
    pub const ADMIN: &[u8] = b"REG_ADMN";
    pub const COMM: &[u8] = b"REG_COMM";
}

/// Registrar contract for the `.stellar` namespace.
/// Provides commit–reveal registration, renewals, and availability checks.
/// Interacts with the Registry (and optionally Resolver) contracts.
#[contract]
pub struct Registrar;

#[contracttype]
pub struct RegistrarParams {
    pub min_label_len: u32,
    pub max_label_len: u32,
    pub commit_min_age_secs: u64,
    pub commit_max_age_secs: u64,
    pub renew_extension_secs: u64,
    pub grace_period_secs: u64,
}

#[contracttype]
pub enum RegistrarError {
    AlreadyInitialized,
    NotInitialized,
    NotAdmin,
    NotOwner,
    InvalidLabel,
    CommitmentExists,
    CommitmentMissingOrStale,
    NameNotAvailable,
}

#[contracttype]
pub struct EvtCommitMade {
    pub commitment: BytesN<32>,
    pub at: u64,
}

#[contracttype]
pub struct EvtNameRegistered {
    pub namehash: BytesN<32>,
    pub owner: Address,
    pub expires_at: u64,
}

#[contracttype]
pub struct EvtNameRenewed {
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contractimpl]
impl Registrar {
    pub fn init(env: Env, _registry: Address, _tld: Bytes, _admin: Address) {
        // TODO: Implement initialization logic
    }

    pub fn commit(env: Env, _caller: Address, _commitment: BytesN<32>) {
        // TODO: Store commitment with timestamp; emit EvtCommitMade
    }

    pub fn register(
        env: Env,
        _caller: Address,
        _label: Bytes,
        _owner: Address,
        _secret: Bytes,
        _resolver: Option<Address>,
    ) -> BytesN<32> {
        // TODO: Verify commitment, check availability, set owner in Registry, emit event
        BytesN::from_array(&env, &[0u8; 32])
    }

    pub fn renew(env: Env, _caller: Address, _label: Bytes) {
        // TODO: Extend expiry in Registry; emit EvtNameRenewed
    }

    pub fn available(env: Env, _label: Bytes) -> bool {
        // TODO: Query Registry and determine availability
        false
    }

    pub fn registry(env: Env) -> Address {
        // TODO: Return stored Registry address
        Address::random(&env)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_placeholder() {
        let env = Env::default();
        let admin = Address::random(&env);
        let registry = Address::random(&env);
        let tld = Bytes::from_slice(&env, b"stellar");
        Registrar::init(env.clone(), registry, tld, admin);
        // TODO: Expand unit tests once logic is implemented
    }
}
